import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-3xl text-indigo-500">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl text-indigo-400 pt-4">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg text-indigo-300 pt-4">{children}</h3>
    ),
    ul: ({ children }) => <ul className="list-disc pl-10">{children}</ul>,
    ...components,
  };
}
