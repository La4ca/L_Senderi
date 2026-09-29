import { NavLink, Route, Routes } from "react-router-dom";

type IconName = "home" | "users" | "message" | "user" | "bell" | "plus" | "arrow";

function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v10h14V9" /><path d="M9 19v-6h6v6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    message: <><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 9.62 9.62 0 0 1-4-.8L3 21l1.8-4A8.3 8.3 0 0 1 3 11.5 8.38 8.38 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  };

  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const navigation = [
  { label: "Home", to: "/", icon: "home" as const },
  { label: "Friends", to: "/friends", icon: "users" as const },
  { label: "Messages", to: "/messages", icon: "message" as const },
  { label: "Profile", to: "/profile", icon: "user" as const },
];

function PlaceholderPage({ title, description, eyebrow = "Senderi space" }: { title: string; description: string; eyebrow?: string }) {
  return (
    <section className="surface-card p-7 sm:p-10">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="mt-4 max-w-2xl text-3xl font-bold tracking-[-0.04em] text-ink sm:text-5xl">{title}</h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">{description}</p>
    </section>
  );
}

function HomePage() {
  return (
    <div className="space-y-5">
      <section className="hero-card relative overflow-hidden p-7 sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <span className="eyebrow eyebrow-light">Your space to connect</span>
          <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.08] tracking-[-0.05em] text-white sm:text-6xl">Make space for the good stuff.</h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/70 sm:text-lg">Share a moment, catch up with your people, and keep the little things that matter close.</p>
          <button className="button-accent mt-7" type="button"><Icon name="plus" size={18} /> Create a post</button>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-[1.3fr_0.7fr]">
        <section className="surface-card flex min-h-44 flex-col justify-between p-6 sm:p-7">
          <div>
            <p className="text-sm font-semibold text-muted">Your timeline</p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-ink">A fresh start feels good.</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">When your friends start sharing, their updates will show up here.</p>
          </div>
          <button className="button-link mt-6" type="button">Find your friends <Icon name="arrow" size={16} /></button>
        </section>
        <section className="accent-card flex min-h-44 flex-col justify-between p-6 sm:p-7">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold text-ink/70">Today’s note</span><span className="sparkle">✦</span></div>
          <p className="mt-8 text-2xl font-bold tracking-[-0.04em] text-ink">Stay curious.<br />Stay connected.</p>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line/80 bg-canvas/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <NavLink to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-[-0.06em] text-ink sm:text-2xl">senderi<span className="text-violet">.</span></NavLink>
          <div className="flex items-center gap-3">
            <button className="icon-button hidden sm:flex" type="button" aria-label="Notifications"><Icon name="bell" size={19} /><span className="notification-dot" /></button>
            <span className="hidden text-sm font-medium text-muted sm:inline">Welcome back, Laica</span>
            <div className="avatar">L</div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <nav aria-label="Main navigation" className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-8 lg:flex-col lg:overflow-visible">
            <p className="mb-2 hidden px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted lg:block">Explore</p>
            {navigation.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}><Icon name={item.icon} size={19} />{item.label}</NavLink>)}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/friends" element={<PlaceholderPage title="Your people, all in one place." description="Friend requests and your connections will appear here." eyebrow="Friends" />} />
            <Route path="/messages" element={<PlaceholderPage title="Conversations that feel easy." description="Your private conversations will appear here." eyebrow="Messages" />} />
            <Route path="/profile" element={<PlaceholderPage title="A little more about you." description="Tell your friends a little more about who you are." eyebrow="Profile" />} />
            <Route path="*" element={<PlaceholderPage title="That page is still finding its way." description="The page you are looking for does not exist yet." />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
