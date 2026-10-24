import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, type WardrobeItem } from "../api";
import { useAuth } from "../auth";
import { ItemCard } from "../components/ItemCard";
import { groupByCategory } from "../wardrobe";

interface PendingUpload {
  key: string;
  previewUrl: string;
  name: string;
  error?: string;
}

export function WardrobePage() {
  const { user } = useAuth();
  const canEdit = !user?.readOnly;
  const [items, setItems] = useState<WardrobeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<WardrobeItem[]>("/items").then(setItems, (err) => setError(err.message));
  }, []);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const uploads = files.map((file, i) => ({
      file,
      pending: { key: `${Date.now()}-${i}`, previewUrl: URL.createObjectURL(file), name: file.name },
    }));
    setPending((p) => [...uploads.map((u) => u.pending), ...p]);

    // One at a time: each upload is a model call that counts toward the daily quota.
    for (const { file, pending: p } of uploads) {
      const body = new FormData();
      body.append("image", file);
      try {
        const item = await api<WardrobeItem>("/items", { method: "POST", body });
        setItems((current) => [item, ...(current ?? [])]);
        setPending((all) => all.filter((x) => x.key !== p.key));
        URL.revokeObjectURL(p.previewUrl);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Upload failed.";
        setPending((all) => all.map((x) => (x.key === p.key ? { ...x, error: message } : x)));
      }
    }
  }

  async function remove(item: WardrobeItem) {
    try {
      await api(`/items/${item.id}`, { method: "DELETE" });
      setItems((current) => current?.filter((i) => i.id !== item.id) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the item.");
    }
  }

  const dismiss = (key: string) => setPending((all) => all.filter((x) => x.key !== key));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{user?.readOnly ? "Demo wardrobe" : "Your wardrobe"}</h1>
          {items && <p className="muted">{items.length} {items.length === 1 ? "item" : "items"}</p>}
        </div>
        {canEdit && (
          <>
            <button className="primary" onClick={() => fileInput.current?.click()}>Upload photos</button>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={onFiles} />
          </>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {pending.length > 0 && (
        <div className="grid">
          {pending.map((p) => (
            <article className="item-card" key={p.key}>
              <div className="item-photo pending">
                <img src={p.previewUrl} alt="" />
                {!p.error && <span className="pending-label">Analyzing…</span>}
              </div>
              <div className="item-body">
                {p.error ? (
                  <>
                    <p className="error small">{p.error}</p>
                    <button className="link-button small" onClick={() => dismiss(p.key)}>Dismiss</button>
                  </>
                ) : (
                  <p className="muted small">{p.name}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {items === null && !error && <p className="muted">Loading…</p>}

      {items?.length === 0 && pending.length === 0 && (
        <div className="empty">
          <h2>No items yet</h2>
          <p className="muted">
            Upload photos of your clothes, one item per photo, ideally on a plain background. Claude reads each
            photo and records its type, color, formality, warmth and seasons.
          </p>
        </div>
      )}

      {items && groupByCategory(items).map((group) => (
        <div key={group.category} className="group">
          <h2 className="group-title">{group.label} <span className="muted">{group.items.length}</span></h2>
          <div className="grid">
            {group.items.map((item) => (
              <ItemCard key={item.id} item={item} {...(canEdit ? { onDelete: () => remove(item) } : {})} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
