import { ActivityFeed } from "../components/ActivityFeed";
import { ModeChrome } from "../components/ModeChrome";
import { useTerm } from "../state/store";

export function ActivityView() {
  const items = useTerm((s) => s.activity);
  return (
    <div className="window">
      <ModeChrome title={`Activity · ${items.length}`} />
      <section className="panel"><div className="body"><ActivityFeed items={items} /></div></section>
      <div />
    </div>
  );
}
