export default function RulesPage() {
  return (
    <main>
      <h1>How This Works</h1>
      <p className="subtext">The rules, the timing, the money, and how to get around the site.</p>

      <div className="card">
        <div className="matchup">The Pick</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", marginBottom: "10px" }}>
          Each week you make <strong>5 picks</strong> &mdash; any mix of spread and total picks,
          on any games you want, including doubling up on the same game if you like.
        </p>
        <p style={{ fontSize: "13px", margin: 0 }}>
          Plus <strong>1 dog pick</strong>: a moneyline pick on an underdog. It only pays off if that
          team wins outright &mdash; if it does, you earn points equal to the spread they were getting
          (a +7.5 dog that wins straight up is worth 7.5 points). If it loses, it&apos;s just 0 points,
          no penalty.
        </p>
      </div>

      <div className="card">
        <div className="matchup">Locking In</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", marginBottom: "10px" }}>
          Lines start showing as soon as the site pulls that week&apos;s odds for the first time. From
          that moment on, you can pick and lock any game, any time during the week &mdash; the number
          you see is live and can move right up until you lock it.
        </p>
        <p style={{ fontSize: "13px", marginBottom: "10px" }}>
          Hitting <strong>Lock In</strong> freezes whatever line and juice DraftKings is showing at
          that exact moment &mdash; not what it was when you first opened the page, not what it becomes
          later. Different people can end up with different numbers on the same game depending on when
          each of you locked, and that&apos;s expected.
        </p>
        <p style={{ fontSize: "13px", margin: 0 }}>
          If you never lock a pick yourself, it <strong>auto-locks 30 minutes before kickoff</strong> at
          whatever the line is at that point. Once a game locks &mdash; by you or automatically &mdash;
          it&apos;s final for that pick.
        </p>
      </div>

      <div className="card">
        <div className="matchup">Reading the Odds</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", margin: 0 }}>
          Every spread, total, and dog pick shows its juice right alongside the number (like{" "}
          <span className="mono">-110</span>) &mdash; that&apos;s the price you&apos;d actually be
          paying for that side. Use it to eyeball whether a line looks fairly priced or too juiced
          before you lock it in.
        </p>
      </div>

      <div className="card card-accent-money">
        <div className="matchup">The Money</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", marginBottom: "10px" }}>
          <strong>$25/week.</strong> Whoever gets the most of their 5 picks correct that week
          takes the entire pot. Ties don&apos;t split &mdash; the pot rolls into next week and stacks
          with that week&apos;s buy-ins, so a tie week can turn into a bigger pot down the line.
        </p>
        <p style={{ fontSize: "13px", margin: 0 }}>
          <strong>$100 for the season</strong> buys into the Cavedogs competition &mdash; your dog pick
          points accumulate all year. At season&apos;s end, it pays $400 to 1st place, $200 to 2nd, and
          $100 to 3rd.
        </p>
      </div>

      <div className="card card-accent-dog">
        <div className="matchup">Getting Around the Site</div>
        <div className="divider" />
        <p style={{ fontSize: "13px", marginBottom: "8px" }}>
          <strong>My Picks</strong> &mdash; your own private pick sheet. This is where you actually
          select and lock picks. Your browser remembers your link once you&apos;ve opened it, so you
          can always jump back here from the nav.
        </p>
        <p style={{ fontSize: "13px", marginBottom: "8px" }}>
          <strong>Board</strong> &mdash; everyone&apos;s picks in one place, updated live. See who&apos;s
          locked what, who&apos;s covering, who&apos;s not.
        </p>
        <p style={{ fontSize: "13px", margin: 0 }}>
          <strong>Standings</strong> &mdash; the weekly pot status, season records for every player, and
          the Cavedogs leaderboard.
        </p>
      </div>
    </main>
  );
}
