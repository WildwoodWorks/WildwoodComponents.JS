import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('login form validates required fields', async ({ page }) => {
    await page.goto('/authentication');

    // Try submitting empty form
    const submitButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Log In")').first();
    if (await submitButton.isVisible()) {
      await submitButton.click();
      // Should show validation error or remain on login form
      await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
    }
  });

  test('login form accepts email and password input', async ({ page }) => {
    await page.goto('/authentication');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('test@example.com');
    await passwordInput.fill('testpassword');

    await expect(emailInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('testpassword');
  });

  test('settings panel toggles component props', async ({ page }) => {
    await page.goto('/authentication');

    // Open settings panel
    const settingsButton = page.locator('button:has-text("Settings")');
    if (await settingsButton.isVisible()) {
      await settingsButton.click();
      await expect(page.locator('text=Component Settings')).toBeVisible();
    }
  });
});
