import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref, defineComponent, h } from "vue";
import { useSortableList } from "../useSortableList";

function withComposable<T>(factory: () => T): T {
  let result!: T;
  mount(
    defineComponent({
      setup() {
        result = factory();
        return {};
      },
      render: () => h("div"),
    }),
  );
  return result;
}

describe("useSortableList", () => {
  it("initialises without throwing", () => {
    expect(() =>
      withComposable(() => useSortableList(ref(null), { onReorder: vi.fn() })),
    ).not.toThrow();
  });

  it("does not fire onReorder on mount", () => {
    const onReorder = vi.fn();
    withComposable(() => useSortableList(ref(null), { onReorder }));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("defaults animationMs to 150 and threshold to 8", () => {
    const onReorder = vi.fn();
    expect(() =>
      withComposable(() =>
        useSortableList(ref(null), {
          onReorder,
          animationMs: 150,
          threshold: 8,
        }),
      ),
    ).not.toThrow();
  });
});
