// A collapsible "Deleted ..." list. Deleting in this app only hides things, so each row has a Restore button.
export default function TrashList({ title, items, onRestore }) {
  if (!items || items.length === 0) return null;
  return (
    <details className="card trash">
      <summary>{title} ({items.length})</summary>
      <div className="trash-list">
        {items.map((it) => (
          <div className="trash-row" key={it.id}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{it.title}</b>
              {it.detail && <span className="muted" style={{ display: 'block', fontSize: 13 }}>{it.detail}</span>}
            </span>
            <button className="btn primary" onClick={() => onRestore(it)}>Restore</button>
          </div>
        ))}
      </div>
    </details>
  );
}
