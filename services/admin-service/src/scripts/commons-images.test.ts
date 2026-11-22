import { describe, expect, it } from "vitest";
import { findImage, pickImage, plainAuthor, reusableLicense, titleMatches, uploadThumbUrl, type CommonsPage } from "./commons-images";

const page = (title: string, license: string, extra: Partial<NonNullable<CommonsPage["imageinfo"]>[number]> = {}, index = 1): CommonsPage => ({
  title, index,
  imageinfo: [{
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/500px-x.jpg`,
    width: 2000, mime: "image/jpeg", descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    extmetadata: { LicenseShortName: { value: license }, Artist: { value: "<a href=\"//commons.wikimedia.org/wiki/User:X\">Jane &amp; Co</a>" } },
    ...extra,
  }],
});

describe("Commons image matching", () => {
  it("accepts only reusable licenses", () => {
    for (const ok of ["CC0", "CC BY 4.0", "CC BY-SA 3.0", "Public domain", "PD-self"]) expect(reusableLicense(ok)).toBe(true);
    for (const bad of ["CC BY-NC 2.0", "CC BY-NC-SA 4.0", "CC BY-ND 4.0", "Fair use", "", undefined]) expect(reusableLicense(bad)).toBe(false);
  });

  it("titles must contain every word of the term, accent-insensitive; drawings, maps and plants are skipped", () => {
    expect(titleMatches("File:Fresh tomatoes on a plate.jpg", "tomato")).toBe(true);
    expect(titleMatches("File:Rau muống xào tỏi.jpg", "rau muống")).toBe(true);
    expect(titleMatches("File:Water spinach market.jpg", "water spinach")).toBe(true);
    expect(titleMatches("File:Spinach.jpg", "water spinach")).toBe(false);
    expect(titleMatches("File:Tomato drawing.png", "tomato")).toBe(false);
    expect(titleMatches("File:Tomato plant.jpg", "tomato")).toBe(false);
    // Vietnamese terms keep their accents: "bơ" (butter) is not the town Bo, "cà" is not "cá".
    expect(titleMatches("File:Bo-City-Sierra-Leone.jpg", "Bơ")).toBe(false);
    expect(titleMatches("File:Cá kho tộ.jpg", "Cà chua")).toBe(false);
    expect(titleMatches("File:Bánh mì Sài Gòn.jpg", "Bánh mì")).toBe(true);
    expect(titleMatches("File:Suối nước nóng ở Shargaljuut.jpg", "Nước suối")).toBe(false);
    expect(titleMatches("File:Lava Etam; Black Pepper (William Farquhar Collection).jpg", "black pepper")).toBe(false);
    // Seen in real Commons results: bands, butterflies, paintings, flowers.
    expect(titleMatches("File:The Milk Carton Kids at 9-30 Club.jpg", "milk carton")).toBe(false);
    expect(titleMatches("File:Pieris brassicae - Large Cabbage White - 02.jpg", "cabbage")).toBe(false);
    expect(titleMatches("File:Clara Peeters - Still Life with Cheeses.jpg", "cheese")).toBe(false);
    expect(titleMatches("File:Potato flowers 2016 G1.jpg", "potato")).toBe(false);
    expect(titleMatches("File:Peanuts - in shell, shelled.jpg", "peanuts")).toBe(true);
  });

  it("stores the upload.wikimedia.org thumbnail even when Commons answers with thumb.wikimedia.org", () => {
    expect(uploadThumbUrl("https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/500px-Tomato_je.jpg?utm_source=x"))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/500px-Tomato_je.jpg");
    expect(uploadThumbUrl("https://example.com/wikipedia/commons/a.jpg")).toBeNull();
    expect(uploadThumbUrl(undefined)).toBeNull();
  });

  it("picks the first acceptable photo in search order with its credit", () => {
    const picked = pickImage([
      page("File:Tomato logo.png", "CC0", {}, 1),
      page("File:Tomatoes NC.jpg", "CC BY-NC 2.0", {}, 2),
      page("File:Small tomato.jpg", "CC0", { width: 120 }, 3),
      page("File:Red tomatoes.jpg", "CC BY-SA 4.0", {}, 4),
    ], "tomato");
    expect(picked?.title).toBe("File:Red tomatoes.jpg");
    expect(picked?.imageLicense).toBe("CC BY-SA 4.0");
    expect(picked?.imageAuthor).toBe("Jane & Co");
    expect(picked?.imageUrl.startsWith("https://upload.wikimedia.org/")).toBe(true);
    expect(picked?.imageSource).toContain("commons.wikimedia.org/wiki/");
    expect(plainAuthor(undefined)).toBe("");
  });

  it("waits and retries when Commons throttles (429 with Retry-After)", async () => {
    const waits: number[] = [];
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "2" } })
        : new Response(JSON.stringify({ query: { pages: [page("File:Red tomatoes.jpg", "CC0")] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const { searchCommons } = await import("./commons-images");
    const pages = await searchCommons("tomato", fetchImpl, async (ms) => { waits.push(ms); });
    expect(pages).toHaveLength(1);
    expect(waits).toEqual([2500]);
  });

  it("tries the English name first, then the Vietnamese one; nothing confident gives null", async () => {
    const searched: string[] = [];
    const search = async (term: string) => { searched.push(term); return term === "cà chua" ? [page("File:Cà chua Đà Lạt.jpg", "CC BY 4.0")] : []; };
    expect((await findImage({ vi: "cà chua", en: "tomato" }, search))?.title).toBe("File:Cà chua Đà Lạt.jpg");
    expect(searched).toEqual(["tomato", "cà chua"]);
    expect(await findImage({ vi: "Hạt nêm" }, async () => [page("File:Something else.jpg", "CC0")])).toBeNull();
    // A single Vietnamese word is never searched on its own.
    const singles: string[] = [];
    expect(await findImage({ vi: "Muối", en: "table salt" }, async (term) => { singles.push(term); return []; })).toBeNull();
    expect(singles).toEqual(["table salt"]);
  });
});
