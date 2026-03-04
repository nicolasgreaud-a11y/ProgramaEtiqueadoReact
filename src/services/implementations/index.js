import { apiImplementation } from "./apiImplementation";
import { localImplementation } from "./localImplementation";

export const IMPLEMENTATIONS = [localImplementation, apiImplementation];

export function getImplementationById(id) {
  return IMPLEMENTATIONS.find((item) => item.id === id) ?? localImplementation;
}
