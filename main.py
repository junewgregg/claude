#!/usr/bin/env python3
import asyncio
import sys
from rich.console import Console
from rich.prompt import Prompt, Confirm
from rich.panel import Panel
from rich.text import Text
from playwright.async_api import async_playwright

from linkedin_messenger.browser import create_browser_context, ensure_logged_in
from linkedin_messenger.messenger import send_message, search_and_message

console = Console()


def get_multiline_message() -> str:
    console.print("[dim]Enter your message (type END on a blank line to finish):[/dim]")
    lines = []
    while True:
        try:
            line = input()
            if line.strip() == "END":
                break
            lines.append(line)
        except EOFError:
            break
    return "\n".join(lines)


async def main():
    console.print(Panel(
        Text("LinkedIn Messenger", justify="center", style="bold blue"),
        subtitle="Browser automation — your session stays private"
    ))

    async with async_playwright() as p:
        browser, context = await create_browser_context(p)
        page = await context.new_page()

        try:
            logged_in = await ensure_logged_in(context, page)
            if not logged_in:
                console.print("[red]Could not log in. Exiting.[/red]")
                return

            console.print("[green]Logged in to LinkedIn.[/green]\n")

            while True:
                console.rule()
                recipient_type = Prompt.ask(
                    "Send to",
                    choices=["url", "name", "quit"],
                    default="url"
                )

                if recipient_type == "quit":
                    break

                if recipient_type == "url":
                    recipient = Prompt.ask("LinkedIn profile URL (e.g. https://www.linkedin.com/in/johndoe)")
                else:
                    recipient = Prompt.ask("Full name to search for")

                message = get_multiline_message()

                if not message.strip():
                    console.print("[yellow]Empty message, skipping.[/yellow]")
                    continue

                console.print()
                if recipient_type == "url":
                    success = await send_message(page, recipient, message)
                else:
                    success = await search_and_message(page, recipient, message)

                if not Confirm.ask("\nSend another message?", default=True):
                    break

        finally:
            await browser.close()

    console.print("[dim]Done. Goodbye.[/dim]")


if __name__ == "__main__":
    asyncio.run(main())
