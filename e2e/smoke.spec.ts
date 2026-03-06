import { test, expect } from '@playwright/test';

test.describe('Test Suite Smoke Tests', () => {
  test('home page loads with status card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Wildwood Components Test Suite');
    await expect(page.locator('text=SDK Initialized')).toBeVisible();
  });

  test('navigation menu has all test page links', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav');
    await expect(nav.locator('a[href="/authentication"]')).toBeVisible();
    await expect(nav.locator('a[href="/notifications"]')).toBeVisible();
    await expect(nav.locator('a[href="/theme"]')).toBeVisible();
    await expect(nav.locator('a[href="/ai-chat"]')).toBeVisible();
    await expect(nav.locator('a[href="/messaging"]')).toBeVisible();
    await expect(nav.locator('a[href="/payment"]')).toBeVisible();
  });

  test('authentication page renders login form', async ({ page }) => {
    await page.goto('/authentication');
    await expect(page.locator('h1')).toContainText('Authentication');
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
  });

  test('notification page can show and dismiss toasts', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('text=Active Toasts (0)')).toBeVisible();

    await page.click('button:has-text("Success")');
    await expect(page.locator('text=Active Toasts (1)')).toBeVisible();

    await page.click('button:has-text("Dismiss")');
    await expect(page.locator('text=Active Toasts (0)')).toBeVisible();
  });

  test('theme page can switch themes', async ({ page }) => {
    await page.goto('/theme');
    await expect(page.locator('h1')).toContainText('Theme');

    await page.click('button:has-text("ocean-breeze")');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'ocean-breeze');
  });

  test('all test pages load without errors', async ({ page }) => {
    const pages = [
      '/authentication',
      '/notifications',
      '/theme',
      '/twofactor',
      '/token-registration',
      '/disclaimer',
      '/app-tier',
      '/ai-chat',
      '/ai-flow',
      '/messaging',
      '/payment',
      '/subscription',
    ];

    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      // Ensure no uncaught errors rendered
      const errorOverlay = page.locator('vite-error-overlay');
      await expect(errorOverlay).toHaveCount(0);
    }
  });
});
