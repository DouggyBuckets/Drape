import type { WardrobeItem } from "../api";
import { CATEGORY_ICON, FORMALITY_LABEL, swatch, WARMTH_LABEL } from "../wardrobe";

export function ItemPhoto({ item }: { item: Pick<WardrobeItem, "name" | "category" | "color" | "imageUrl"> }) {
  if (item.imageUrl) return <img className="item-photo" src={item.imageUrl} alt={item.name} loading="lazy" />;
  // No photo (fixture items): a swatch of the item's color with its category icon.
  return (
    <div className="item-photo placeholder" style={{ background: swatch(item.color) }} role="img" aria-label={item.name}>
      <span className="placeholder-icon">{CATEGORY_ICON[item.category]}</span>
    </div>
  );
}

export function ItemCard({ item, onDelete }: { item: WardrobeItem; onDelete?: () => void }) {
  return (
    <article className="item-card">
      <ItemPhoto item={item} />
      <div className="item-body">
        <h3 className="item-name">{item.name}</h3>
        <p className="item-meta">
          {FORMALITY_LABEL[item.formality]} · {WARMTH_LABEL[item.warmth]}
        </p>
        <p className="item-meta muted">{item.seasons.join(", ")}</p>
        {onDelete && (
          <button
            className="link-button small item-remove"
            onClick={() => {
              if (confirm(`Remove "${item.name}" from your wardrobe?`)) onDelete();
            }}
          >
            Remove
          </button>
        )}
      </div>
    </article>
  );
}
