import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

// Mock lovable auth
vi.mock("@/integrations/lovable/index", () => ({
  lovable: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("OAuthButtons", () => {
  it("renders Google and Apple buttons", () => {
    const { getByText } = render(<OAuthButtons />);
    expect(getByText("Prihlásiť sa cez Google")).toBeInTheDocument();
    expect(getByText("Prihlásiť sa cez Apple")).toBeInTheDocument();
  });

  it("renders divider text", () => {
    const { getByText } = render(<OAuthButtons />);
    expect(getByText("alebo")).toBeInTheDocument();
  });

  it("disables buttons when disabled prop is true", () => {
    const { getAllByRole } = render(<OAuthButtons disabled />);
    const buttons = getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("calls signInWithOAuth with google on click", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    const { getByText } = render(<OAuthButtons />);
    getByText("Prihlásiť sa cez Google").click();
    expect(lovable.auth.signInWithOAuth).toHaveBeenCalledWith("google", {
      redirect_uri: "http://localhost:3000",
    });
  });

  it("calls signInWithOAuth with apple on click", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    const { getByText } = render(<OAuthButtons />);
    getByText("Prihlásiť sa cez Apple").click();
    expect(lovable.auth.signInWithOAuth).toHaveBeenCalledWith("apple", {
      redirect_uri: "http://localhost:3000",
    });
  });

  it("shows error toast on OAuth failure", async () => {
    const { lovable } = await import("@/integrations/lovable/index");
    const { toast } = await import("sonner");
    (lovable.auth.signInWithOAuth as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: new Error("fail"),
    });
    const { getByText } = render(<OAuthButtons />);
    getByText("Prihlásiť sa cez Google").click();
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Prihlásenie cez Google zlyhalo");
    });
  });
});
