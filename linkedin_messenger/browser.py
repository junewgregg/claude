import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, BrowserContext, Page

SESSION_FILE = Path("session.json")
LINKEDIN_HOME = "https://www.linkedin.com/feed/"
LINKEDIN_LOGIN = "https://www.linkedin.com/login"


async def is_logged_in(page: Page) -> bool:
    try:
        await page.goto(LINKEDIN_HOME, wait_until="domcontentloaded", timeout=15000)
        return "feed" in page.url
    except Exception:
        return False


async def login_and_save_session(context: BrowserContext, page: Page) -> bool:
    from rich.console import Console
    console = Console()

    await page.goto(LINKEDIN_LOGIN)
    console.print("[yellow]Please log in to LinkedIn in the browser window.[/yellow]")
    console.print("[yellow]Press Enter here once you are logged in...[/yellow]")
    input()

    if "feed" in page.url or "linkedin.com/in/" in page.url:
        cookies = await context.cookies()
        SESSION_FILE.write_text(json.dumps(cookies))
        console.print("[green]Session saved.[/green]")
        return True
    else:
        console.print("[red]Login not detected. Please try again.[/red]")
        return False


async def create_browser_context(playwright):
    browser = await playwright.chromium.launch(headless=False)
    context = await browser.new_context()

    if SESSION_FILE.exists():
        cookies = json.loads(SESSION_FILE.read_text())
        await context.add_cookies(cookies)

    return browser, context


async def ensure_logged_in(context: BrowserContext, page: Page) -> bool:
    if not await is_logged_in(page):
        return await login_and_save_session(context, page)
    return True
