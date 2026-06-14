import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { describe, it, expect, vi } from "vitest";

import { ListenerUpgradePrompt } from "../ListenerUpgradePrompt";

describe("ListenerUpgradePrompt", () => {
  it("renders the message", () => {
    render(<ListenerUpgradePrompt roomSlug="test-room" message="Upgrade now!" />);
    expect(screen.getByText("Upgrade now!")).toBeInTheDocument();
  });

  it("renders a link to the join page when onUpgrade is not provided", () => {
    render(<ListenerUpgradePrompt roomSlug="test-room" message="Upgrade now!" />);
    const link = screen.getByRole("link", { name: "Get a nickname" });
    expect(link).toHaveAttribute("href", "/rooms/test-room/join");
  });

  it("renders a button and calls onUpgrade when clicked", () => {
    const onUpgrade = vi.fn();
    render(
      <ListenerUpgradePrompt
        roomSlug="test-room"
        message="Upgrade now!"
        onUpgrade={onUpgrade}
      />,
    );
    const button = screen.getByRole("button", { name: "Get a nickname" });
    fireEvent.click(button);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
