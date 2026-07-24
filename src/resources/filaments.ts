/**
 * @remarks Non-exhaustive placeholder. No confirmed filament/material
 * enumeration endpoint exists in Slant3D's documentation — this is a loose
 * string type, not a verified enum, so it accepts any value until a real
 * endpoint or schema can be confirmed. Used as the type of
 * `CreateOrderRequest.order_item_color` in `src/resources/orders.ts`.
 */
export type FilamentColor = string;
