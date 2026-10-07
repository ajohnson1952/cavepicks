import LabClient from "./LabClient";
import LineMoveMock from "./LineMoveMock";
import YahnMock from "./YahnMock";
import NavMock from "./NavMock";

// Hidden test bench (not linked anywhere) for the tactile stuff: haptics,
// the "fully locked in" money shower, and pull-to-refresh. Touches no data.
export const metadata = { title: "Cavepicks Lab", robots: { index: false } };
export const dynamic = "force-dynamic"; // so the "rendered at" time proves a refresh happened

export default function LabPage() {
  return (
    <main>
      <h1>Lab 🧪</h1>
      <p className="subtext">
        Test bench for haptics, the lock-in celebration, and pull-to-refresh. Nothing here saves anything.
      </p>
      <NavMock />
      <YahnMock />
      <LineMoveMock />
      <LabClient
        renderedAt={new Date().toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", second: "2-digit" }) + " CT"}
      />
    </main>
  );
}
