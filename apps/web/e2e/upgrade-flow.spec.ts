import { test, expect } from "@playwright/test";

test.describe("Native Access-Tier & In-Place Upgrade Flow", () => {
  test("creator starts as Listener, gates interactive inputs, hides chat, upgrades in-place to Host, and unlocks actions", async ({
    page,
  }) => {
    // 1. Navigate to landing page and create a room
    await page.goto("/");
    const roomName = `E2E Room ${Math.random().toString(36).substring(2, 8)}`;
    await page.getByLabel("Room name").fill(roomName);
    await page.getByRole("button", { name: "Create room" }).click();

    // 2. Wait for redirect to the nickname join page
    await page.waitForURL(/\/rooms\/[^\/]+\/join/);
    const url = page.url();
    const match = url.match(/\/rooms\/([^\/]+)\/join/);
    const slug = match ? match[1] : null;
    expect(slug).not.toBeNull();

    // 3. Bypass direct join and navigate directly to the room page to enter as Listener
    await page.goto(`/rooms/${slug}`);
    await page.waitForSelector("text=Room Settings");

    // 4. Assert Listener read-only behavior & gates in the room shell
    // The chat, playback controls, and song input should render Listener upgrade prompts
    await expect(
      page.getByText("Get a nickname to add songs or participate."),
    ).toBeVisible();
    await expect(
      page.getByText("Get a nickname to skip or participate."),
    ).toBeVisible();
    await expect(page.getByText("Get a nickname to chat.")).toBeVisible();

    // In the participant list, we should be listed as "Listener" with a "listener" badge
    const participantSection = page.locator("section:has-text('Participants')");
    await expect(participantSection.getByText("Listener", { exact: true })).toBeVisible();
    await expect(participantSection.getByText("listener", { exact: true })).toBeVisible();

    // Verify chat visibility gating (no chat input exists, and recent messages list is empty)
    await expect(page.getByPlaceholder("Say something")).not.toBeVisible();
    const chatPanel = page.locator("section:has-text('Chat')");
    await expect(chatPanel.locator("div.overflow-auto p")).not.toBeVisible();

    // 5. Inject a window continuity marker to assert that the room shell does not hard reload/reset
    await page.evaluate(() => {
      (window as any).__test_continuity_marker = "persisted";
    });

    // 6. Trigger the protect-and-join in-place upgrade flow
    // Click the CTA button in the chat panel prompt
    await chatPanel.getByRole("button", { name: "Get a nickname" }).click();

    // Verify the upgrade modal opens
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Toggle to registration ("new") mode
    await modal.getByRole("button", { name: "New here? Create a protected nickname" }).click();
    await expect(modal.getByRole("heading", { name: "Create a protected nickname" })).toBeVisible();

    // Fill in nickname and password details
    const randomNickname = `Host_${Math.random().toString(36).substring(2, 8)}`;
    await modal.getByLabel("Nickname", { exact: true }).fill(randomNickname);
    await modal.getByLabel("Password", { exact: true }).fill("supersecretpassword123");
    await modal.getByLabel("Confirm password", { exact: true }).fill("supersecretpassword123");

    // Submit and wait for the modal to close after upgrade completes
    await modal.getByRole("button", { name: "Create nickname and join" }).click();
    await expect(modal).not.toBeVisible();

    // 7. Verify the user upgraded in-place to Host and that window context was preserved
    // Assert that the window continuity marker survived the upgrade (proving no hard reset occurred)
    const markerValue = await page.evaluate(() => (window as any).__test_continuity_marker);
    expect(markerValue).toBe("persisted");

    // The participant list should now show the new nickname with the upgraded "host" badge
    await expect(participantSection.getByText(randomNickname)).toBeVisible();
    await expect(participantSection.getByText("host", { exact: true })).toBeVisible();
    // The "listener" badge should no longer exist for us
    await expect(participantSection.getByText("listener", { exact: true })).not.toBeVisible();

    // Gated prompts should disappear and member controls should be unlocked
    await expect(
      page.getByText("Get a nickname to add songs or participate."),
    ).not.toBeVisible();
    await expect(page.getByPlaceholder("Say something")).toBeVisible();
    await expect(page.getByPlaceholder("Paste a YouTube URL")).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();

    // 8. Verify chat interactivity and display works after upgrade
    await page.getByPlaceholder("Say something").fill("Hello from the newly promoted Host!");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(chatPanel.getByText("Hello from the newly promoted Host!")).toBeVisible();
  });
});
