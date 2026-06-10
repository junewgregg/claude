import asyncio
from playwright.async_api import Page
from rich.console import Console

console = Console()


async def send_message(page: Page, profile_url: str, message: str) -> bool:
    console.print(f"[cyan]Navigating to {profile_url}...[/cyan]")

    try:
        await page.goto(profile_url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2000)
    except Exception as e:
        console.print(f"[red]Failed to load profile: {e}[/red]")
        return False

    if "linkedin.com/in/" not in page.url:
        console.print("[red]This doesn't look like a LinkedIn profile page.[/red]")
        return False

    # Find the Message button on the profile
    message_button = None
    selectors = [
        'button:has-text("Message")',
        'a:has-text("Message")',
        '[data-control-name="message"]',
    ]

    for sel in selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=3000):
                message_button = btn
                break
        except Exception:
            continue

    if not message_button:
        console.print("[red]Could not find a Message button. You may not be connected with this person, or the layout changed.[/red]")
        return False

    await message_button.click()
    await page.wait_for_timeout(1500)

    # Type in the message compose box
    compose_selectors = [
        '[data-placeholder="Write a message…"]',
        '.msg-form__contenteditable',
        '[aria-label="Write a message…"]',
        'div[contenteditable="true"]',
    ]

    compose_box = None
    for sel in compose_selectors:
        try:
            box = page.locator(sel).first
            if await box.is_visible(timeout=3000):
                compose_box = box
                break
        except Exception:
            continue

    if not compose_box:
        console.print("[red]Could not find the message compose box.[/red]")
        return False

    await compose_box.click()
    await compose_box.fill(message)
    await page.wait_for_timeout(500)

    # Send the message
    send_selectors = [
        'button[type="submit"]:has-text("Send")',
        '.msg-form__send-button',
        'button:has-text("Send")',
    ]

    send_button = None
    for sel in send_selectors:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=3000):
                send_button = btn
                break
        except Exception:
            continue

    if not send_button:
        console.print("[red]Could not find the Send button.[/red]")
        return False

    await send_button.click()
    await page.wait_for_timeout(1500)

    console.print("[green]Message sent successfully![/green]")
    return True


async def search_and_message(page: Page, name: str, message: str) -> bool:
    search_url = f"https://www.linkedin.com/search/results/people/?keywords={name.replace(' ', '%20')}"
    console.print(f"[cyan]Searching for '{name}'...[/cyan]")

    await page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_timeout(2000)

    # Get first result profile link
    try:
        first_result = page.locator('a[href*="/in/"]').first
        href = await first_result.get_attribute("href", timeout=5000)
        if href:
            profile_url = "https://www.linkedin.com" + href if href.startswith("/") else href
            # Strip query params
            profile_url = profile_url.split("?")[0]
            console.print(f"[cyan]Found profile: {profile_url}[/cyan]")
            return await send_message(page, profile_url, message)
    except Exception as e:
        console.print(f"[red]Could not find profile for '{name}': {e}[/red]")

    return False
