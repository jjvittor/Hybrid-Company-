import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LookArchive } from "@/components/LookArchive";

afterEach(cleanup);

describe("Look archive expansion", () => {
  it("opens only one look at a time", () => {
    render(<LookArchive />);
    const first = screen.getByRole("button", { name: "Look 01" });
    const last = screen.getByRole("button", { name: "Look 08" });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(last);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(last).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
  });

  it("closes the active look when clicked again", () => {
    render(<LookArchive />);
    const first = screen.getByRole("button", { name: "Look 01" });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(first);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(8);
  });
});
