import { isJsonObject, type JsonObject, type JsonValue } from "@edgestream/recipes-core";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

export function parseRecipeDocument(text: string, mediaType: string): JsonObject {
  return mediaType === "text/html" ? extractRecipeFromHtml(text) : parseRecipeJson(text);
}

function parseRecipeJson(text: string): JsonObject {
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value) || !hasRecipeType(value)) throw new TypeError("A recipe document must declare @type Recipe.");
  return value;
}

function extractRecipeFromHtml(html: string): JsonObject {
  for (const script of findElements(parse(html).childNodes, "script")) {
    if (attribute(script, "type")?.toLocaleLowerCase() !== "application/ld+json") continue;
    try {
      const recipe = findRecipeJsonLdValue(JSON.parse(textContent(script)) as JsonValue);
      if (recipe) return recipe;
    } catch (error: unknown) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error("HTML document has no schema.org Recipe JSON-LD block.");
}

function findElements(
  nodes: readonly DefaultTreeAdapterTypes.ChildNode[],
  tagName: string,
): DefaultTreeAdapterTypes.Element[] {
  const elements: DefaultTreeAdapterTypes.Element[] = [];
  for (const node of nodes) {
    if (isElement(node, tagName)) elements.push(node);
    if (isHtmlElement(node)) elements.push(...findElements(node.childNodes, tagName));
  }
  return elements;
}

function isElement(
  node: DefaultTreeAdapterTypes.ChildNode,
  tagName: string,
): node is DefaultTreeAdapterTypes.Element {
  return isHtmlElement(node) && node.tagName === tagName;
}

function isHtmlElement(node: DefaultTreeAdapterTypes.ChildNode): node is DefaultTreeAdapterTypes.Element {
  return "tagName" in node && "childNodes" in node;
}

function attribute(element: DefaultTreeAdapterTypes.Element, name: string): string | undefined {
  return element.attrs.find((candidate) => candidate.name === name)?.value;
}

function textContent(element: DefaultTreeAdapterTypes.Element): string {
  return element.childNodes
    .filter((node): node is DefaultTreeAdapterTypes.TextNode => node.nodeName === "#text")
    .map((node) => node.value)
    .join("");
}

function findRecipeJsonLdValue(value: JsonValue): JsonObject | undefined {
  if (Array.isArray(value)) return value.map(findRecipeJsonLdValue).find((recipe) => recipe !== undefined);
  if (!isJsonObject(value)) return undefined;
  if (hasRecipeType(value)) return value;
  const graph = value["@graph"];
  return graph === undefined ? undefined : findRecipeJsonLdValue(graph);
}

function hasRecipeType(value: JsonObject): boolean {
  const type = value["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}
