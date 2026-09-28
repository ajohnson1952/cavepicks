import { computeLedger } from "@/lib/ledger";
import { BANKER_NAME, isBanker, TIE_SPLIT_START_WEEK, WEEKLY_BUYIN } from "@/lib/pot";

export const dynamic = "force-dynamic";

const money = (n: number) => (n < 0 ? `-$${-n}` : `$${n}`);
const signed = (n: number) => (n > 0 ? `+$${n}` : n < 0 ? `-$${-n}` : "$0");

function StatusChip({ balance }: { balance: number }) {
  if (balance === 0) {
    return (
      <span className="locked-badge">
        <span className="locked-dot" />
        <span className="locked-text">SETTLED</span>
      </span>
    );
  }
  if (balance < 0) return <span className="miss-badge">OWES {money(-balance)}</span>;
  return (
    <span className="locked-text" style={{ color: "var(--action-soft)", background: "rgba(47, 107, 255, 0.14)", padding: "3px 8px", borderRadius: "4px" }}>
      GETS {money(balance)}
    </span>
  );
}

function namesList(names: string[]): string {
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export default async function PotPage() {
  const { players, payments, ledgerWeeks, weekResults, currentWeekNumber, houseTotal } = await computeLedger(2026);

  const current = weekResults.find((w) => w.weekNumber === currentWeekNumber) ?? null;
  const settlers = players.filter((p) => !isBanker(p.name));
  const owedToPlayers = settlers.filter((p) => p.balance > 0).reduce((a, p) => a + p.balance, 0);
  const owedToBank = settlers.filter((p) => p.balance < 0).reduce((a, p) => a - p.balance, 0);
  const sorted = settlers.slice().sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name));
  const banker = players.find((p) => isBanker(p.name));

  return (
    <main>
      <h1>The Pot</h1>
      <p className="subtext">Weekly pot, who owes what, and every payment made.</p>

      {current && (
        <div className="card card-accent-money">
          <div className="matchup">💰 Week {current.weekNumber} Pot</div>
          <div className="stat-hero">{money(current.potAmount)}</div>
          <p className="subtext" style={{ margin: 0 }}>
            {money(current.buyIns)} in buy-ins ({current.buyIns / WEEKLY_BUYIN} &times; {money(WEEKLY_BUYIN)})
            {current.carryIn > 0 ? ` + ${money(current.carryIn)} rolled over` : ""}
          </p>
          <div className="divider" />
          {current.inProgress ? (
            <div style={{ fontSize: "13px", lineHeight: 1.6 }}>
              <div>
                <strong>One winner:</strong> takes all {money(current.potAmount)}.
              </div>
              <div>
                <strong>A tie:</strong> the tied players split {money(Math.floor(current.buyIns / 2))} (half of this
                week&apos;s buy-ins). {money(current.carryIn + Math.floor(current.buyIns / 2))} rolls to next week.
              </div>
            </div>
          ) : (
            <WeekOutcome w={current} />
          )}
        </div>
      )}

      <div className="card">
        <div className="matchup">🧾 How settling up works</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: "0 0 8px", lineHeight: 1.5 }}>
          <strong>Everything is net.</strong> Each week you owe {money(WEEKLY_BUYIN)}. If you win or split a
          pot, your {money(WEEKLY_BUYIN)} comes out of your winnings instead of being paid separately. Example:
          a {money(68)} tie share is <strong>+{money(68 - WEEKLY_BUYIN)}</strong> to you, not {money(68)} in and{" "}
          {money(WEEKLY_BUYIN)} out.
        </p>
        <p style={{ fontSize: "13px", margin: 0, lineHeight: 1.5 }}>
          Your balance below is your running total. <span className="pick-loss">OWES</span> means send {BANKER_NAME}{" "}
          that amount. <span style={{ color: "var(--action-soft)" }}>GETS</span> means {BANKER_NAME} sends it to you.
          Payouts round down to whole dollars; the leftover cents go toward the site&apos;s hosting.
        </p>
      </div>

      <div className="card">
        <div className="matchup">💵 Balances</div>
        <p className="subtext" style={{ margin: "4px 0 0" }}>
          Players owe {money(owedToBank)} &middot; {BANKER_NAME} owes {money(owedToPlayers)}
        </p>
        <table className="stat-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Weeks net</th>
              <th>Paid</th>
              <th>Received</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.userId}>
                <td>{p.name}</td>
                <td className={p.netFromWeeks > 0 ? "pick-win" : p.netFromWeeks < 0 ? "pick-loss" : undefined}>
                  {signed(p.netFromWeeks)}
                </td>
                <td>{p.paidIn ? money(p.paidIn) : "—"}</td>
                <td>{p.paidOut ? money(p.paidOut) : "—"}</td>
                <td>
                  <StatusChip balance={p.balance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {banker && (
          <p className="meta" style={{ margin: "8px 0 0" }}>
            {banker.name} holds the pot, so there&apos;s no balance to settle there (weeks net: {signed(banker.netFromWeeks)}).
          </p>
        )}
        <p className="meta" style={{ margin: "8px 0 0" }}>
          Weeks net = winnings minus {money(WEEKLY_BUYIN)}/week since Week {TIE_SPLIT_START_WEEK}. Paid = sent to{" "}
          {BANKER_NAME}. Received = sent by {BANKER_NAME}. The current week&apos;s buy-in counts as soon as the week starts.
        </p>
      </div>

      <div className="card">
        <div className="matchup">📅 Week by week</div>
        <div className="divider" />
        {ledgerWeeks
          .slice()
          .reverse()
          .map((w) => (
            <div key={w.weekNumber} style={{ marginBottom: "12px" }}>
              <div className="row-between" style={{ fontSize: "13px" }}>
                <strong>Week {w.weekNumber}</strong>
                <span className="mono">
                  pot {money(w.potAmount)}
                  {w.carryIn > 0 ? ` (${money(w.carryIn)} rolled in)` : ""}
                </span>
              </div>
              {w.inProgress ? <p className="meta" style={{ margin: "2px 0 0" }}>in progress</p> : <WeekOutcome w={w} />}
            </div>
          ))}
        <p className="meta" style={{ margin: 0 }}>
          Weeks 1&ndash;{TIE_SPLIT_START_WEEK - 1} ran under the old rules (ties rolled the whole pot) and were settled
          before this tracker started.
        </p>
        {houseTotal > 0 && (
          <p className="meta" style={{ margin: "6px 0 0" }}>
            Rounding kept for hosting so far: {money(houseTotal)}
          </p>
        )}
      </div>

      <div className="card">
        <div className="matchup">📒 Payment log</div>
        <div className="divider" />
        {payments.length === 0 && <p className="subtext" style={{ margin: 0 }}>No payments recorded yet.</p>}
        {payments.map((p) => (
          <div key={p.id} className="row-between" style={{ fontSize: "13px", marginBottom: "4px" }}>
            <span>
              {p.direction === "in" ? (
                <>
                  <strong>{p.user.name}</strong> paid {BANKER_NAME}
                </>
              ) : (
                <>
                  {BANKER_NAME} paid <strong>{p.user.name}</strong>
                </>
              )}{" "}
              <span className="mono">{money(p.amount)}</span>
              {p.note ? <span className="meta"> &middot; {p.note}</span> : null}
            </span>
            <span className="meta">
              {p.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" })}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

function WeekOutcome({
  w,
}: {
  w: {
    weekNumber: number;
    potAmount: number;
    carryOut: number;
    houseCut: number;
    tiedLeaders: string[];
    leader: string | null;
    payouts: { name: string; amount: number }[];
    standings: { name: string; correct: number }[];
  };
}) {
  const top = w.standings[0]?.correct ?? 0;
  return (
    <div style={{ fontSize: "13px", marginTop: "4px", lineHeight: 1.6 }}>
      {w.leader && (
        <div>
          🏆 <strong>{w.leader}</strong> won solo with {top}/5 &mdash; takes {money(w.potAmount)}
        </div>
      )}
      {w.tiedLeaders.length > 0 && (
        <div>
          🤝 <strong>{namesList(w.tiedLeaders)}</strong> tied at {top}/5
        </div>
      )}
      {!w.leader && w.tiedLeaders.length === 0 && <div>Nobody hit a pick &mdash; the whole pot rolls.</div>}
      {w.payouts.map((p) => (
        <div key={p.name} className="mono" style={{ fontSize: "12px" }}>
          {p.name}: {money(p.amount)} won &minus; {money(WEEKLY_BUYIN)} buy-in ={" "}
          <span className="pick-win">{signed(p.amount - WEEKLY_BUYIN)} net</span>
        </div>
      ))}
      {w.payouts.length > 0 && (
        <div className="meta">Everyone else: {signed(-WEEKLY_BUYIN)} net (buy-in)</div>
      )}
      {w.carryOut > 0 && <div className="meta">{money(w.carryOut)} rolls to Week {w.weekNumber + 1}</div>}
      {w.houseCut > 0 && <div className="meta">{money(w.houseCut)} rounding kept for hosting</div>}
    </div>
  );
}
