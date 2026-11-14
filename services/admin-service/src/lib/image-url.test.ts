import { describe, expect, it } from "vitest";
import { imageUrlProblem, MAX_IMAGE_URL_LENGTH } from "./image-url";

describe("imageUrlProblem", () => {
  it.each([
    "https://cdn.example.com/ca-chua.jpg",
    "https://images.example.vn/a/b.png?w=200&h=200",
    "https://8.8.8.8/public.png",
  ])("accepts %s", (url) => {
    expect(imageUrlProblem(url)).toBeNull();
  });

  it.each([
    ["http", "http://cdn.example.com/a.jpg"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/png;base64,iVBORw0KGgo="],
    ["file:", "file:///etc/passwd"],
    ["localhost", "https://localhost/a.jpg"],
    ["*.localhost", "https://img.localhost/a.jpg"],
    ["10.x", "https://10.0.0.1/a.jpg"],
    ["172.16-31.x", "https://172.20.1.1/a.jpg"],
    ["192.168.x", "https://192.168.1.10/a.jpg"],
    ["127.x", "https://127.0.0.1/a.jpg"],
    ["127.x written as an integer", "https://2130706433/a.jpg"],
    ["::1", "https://[::1]/a.jpg"],
    ["link-local", "https://169.254.169.254/latest/meta-data"],
    ["credentials", "https://user:pass@cdn.example.com/a.jpg"],
    ["not a URL", "cdn.example.com/a.jpg"],
  ])("rejects %s", (_label, url) => {
    expect(imageUrlProblem(url)).not.toBeNull();
  });

  it("rejects URLs longer than the limit", () => {
    const url = `https://cdn.example.com/${"a".repeat(MAX_IMAGE_URL_LENGTH)}.jpg`;
    expect(imageUrlProblem(url)).toMatch(/at most/);
  });

  it("keeps public 172.x addresses outside 172.16.0.0/12", () => {
    expect(imageUrlProblem("https://172.32.0.1/a.jpg")).toBeNull();
  });
});
