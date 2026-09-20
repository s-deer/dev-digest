import { describe, expect, it } from "vitest";
import type { Skill } from "@devdigest/shared";
import { buildRows, detachSkill, disableSkill, enableSkill, matchesQuery, moveBy, moveTo, type Link } from "./helpers";

const link = (skill_id: string, order: number, enabled = true): Link => ({ skill_id, order, enabled });
const ids = (links: Link[]) => links.map((l) => `${l.skill_id}${l.enabled ? "" : "(off)"}`);

describe("SkillsTab attachment rules", () => {
  it("keeps a switched-off skill in its slot so switching it on restores the position", () => {
    const links = [link("a", 0), link("b", 1), link("c", 2)];
    const off = disableSkill(links, "b");
    expect(ids(off)).toEqual(["a", "b(off)", "c"]);
    expect(ids(enableSkill(off, "b"))).toEqual(["a", "b", "c"]);
  });

  it("attaches an unattached skill at the end and detaches by removing the link", () => {
    const links = [link("a", 0), link("b", 1)];
    expect(enableSkill(links, "z")).toEqual([link("a", 0), link("b", 1), link("z", 2)]);
    expect(detachSkill(links, "a")).toEqual([link("b", 0)]);
  });

  it("moves only enabled skills and swaps with the enabled neighbour", () => {
    const links = [link("a", 0), link("b", 1, false), link("c", 2)];
    expect(ids(moveBy(links, "a", 1))).toEqual(["c", "b(off)", "a"]);
    expect(ids(moveTo([link("a", 0), link("b", 1), link("x", 2, false), link("c", 3)], "c", "a"))).toEqual(["c", "a", "x(off)", "b"]);
    expect(ids(moveBy([link("a", 0), link("b", 1)], "a", 1))).toEqual(["b", "a"]);
    expect(ids(moveTo(links, "a", "b"))).toEqual(["a", "b(off)", "c"]);
    expect(ids(moveTo(links, "b", "c"))).toEqual(["a", "b(off)", "c"]);
    expect(ids(moveBy(links, "c", 1))).toEqual(["a", "b(off)", "c"]);
  });

  it("lists enabled skills first in prompt order, then switched-off, then unattached by name", () => {
    const skill = (id: string, name: string) => ({ id, name, description: "", type: "custom" }) as Skill;
    const rows = buildRows(
      [skill("u2", "zeta"), skill("u1", "alpha"), skill("off", "off"), skill("on2", "on2"), skill("on1", "on1")],
      [link("on2", 1), link("off", 0, false), link("on1", 2)],
    );
    expect(rows.map((r) => r.skill.id)).toEqual(["on2", "on1", "off", "u1", "u2"]);
    expect(rows.map((r) => r.active)).toEqual([true, true, false, false, false]);
  });

  it("matches name or description case-insensitively", () => {
    expect(matchesQuery({ name: "API contract", description: "" }, "api")).toBe(true);
    expect(matchesQuery({ name: "x", description: "Checks mocks" }, "MOCK")).toBe(true);
    expect(matchesQuery({ name: "x", description: "y" }, "z")).toBe(false);
  });
});
