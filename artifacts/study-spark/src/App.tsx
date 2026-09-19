import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  FlaskConical,
  Globe2,
  Lightbulb,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  getHealthCheckQueryKey,
  getSearchResearchQueryKey,
  useAskStudyAssistant,
  useHealthCheck,
  useSearchResearch,
  type ChatTurn,
  type ResearchSource,
  type StudyAnswer,
  type StudyAskInputMode,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: 'simple' as const,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#292744',
    colorForeground: '#292744',
    colorMutedForeground: '#77718a',
    colorDanger: '#b04f49',
    colorBackground: '#fcf8ed',
    colorInput: '#f7f1e3',
    colorInputForeground: '#292744',
    colorNeutral: '#ded6c4',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fcf8ed] rounded-[24px] w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-[#292744]',
    headerSubtitle: 'text-[#77718a]',
    socialButtonsBlockButtonText: 'text-[#292744] font-semibold',
    formFieldLabel: 'text-[#504a65] font-semibold',
    footerActionLink: 'text-[#b04f49] font-semibold',
    footerActionText: 'text-[#77718a]',
    dividerText: 'text-[#77718a]',
    identityPreviewEditButton: 'text-[#b04f49]',
    formFieldSuccessText: 'text-[#41866c]',
    alertText: 'text-[#b04f49]',
    logoBox: 'mb-3',
    logoImage: 'h-10 w-10',
    socialButtonsBlockButton: 'border-[#ded6c4] bg-[#fffdf6] hover:bg-[#f7f1e3]',
    formButtonPrimary: 'bg-[#ef8065] text-[#292744] hover:bg-[#f39178]',
    formFieldInput: 'border-[#ded6c4] bg-[#f7f1e3] text-[#292744]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#ded6c4]',
    alert: 'border-[#ef8065]/40 bg-[#fff0e9]',
    otpCodeFieldInput: 'border-[#ded6c4] bg-[#f7f1e3] text-[#292744]',
    formFieldRow: 'mb-4',
    main: 'px-5 py-4',
  },
};

type Mode = StudyAskInputMode;

const modes: { key: Mode; label: string; description: string; icon: typeof Lightbulb }[] = [
  { key: 'learn', label: 'Learn', description: 'Build the idea from first principles', icon: Lightbulb },
  { key: 'solve', label: 'Solve', description: 'Work through it, one move at a time', icon: Target },
  { key: 'revise', label: 'Revise', description: 'Turn notes into a sharper memory', icon: RefreshCw },
  { key: 'research', label: 'Research', description: 'Find the strongest public sources', icon: Globe2 },
];

const starterPrompts = [
  { title: 'Make it click', prompt: 'Explain photosynthesis like I already understand cooking, but not biology.', mode: 'learn' as Mode, accent: 'yellow' },
  { title: 'Show your work', prompt: 'Walk me through solving a quadratic equation, then give me one to try.', mode: 'solve' as Mode, accent: 'coral' },
  { title: 'Study sprint', prompt: 'Turn the causes of the French Revolution into a five-question active recall quiz.', mode: 'revise' as Mode, accent: 'mint' },
];

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${small ? '' : 'mb-10'}`}>
      <div className="relative flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#f5df55] text-[#252544] shadow-[3px_3px_0_#e5c93a]">
        <Sparkles size={18} strokeWidth={2.7} />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#ef8065]" />
      </div>
      <div>
        <div className="font-display text-[19px] leading-none tracking-[-0.02em] text-[#fcf3d7]">Study Spark</div>
        <div className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.2em] text-[#a4a0bf]">your thinking room</div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigation = [
    { href: '/', label: 'Study room', icon: BookOpen },
    { href: '/research', label: 'Research desk', icon: Search },
    { href: '/settings', label: 'Preferences', icon: Settings2 },
  ];

  return (
    <div className="grain min-h-[100dvh] bg-[#f7f1e3] text-[#292744]">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[#454261] bg-[#272644] px-5 py-6 transition-[width] duration-300 md:flex ${collapsed ? 'w-[84px]' : 'w-[246px]'}`}>
        <div className={`${collapsed ? 'justify-center' : 'justify-between'} flex items-center`}>
          {collapsed ? <BrandMark small /> : <BrandMark />}
          <button type="button" aria-label="Collapse sidebar" data-testid="button-collapse-sidebar" onClick={() => setCollapsed(!collapsed)} className="rounded-lg p-2 text-[#bcb7d3] transition-colors hover:bg-[#383557] hover:text-[#f5df55]">
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav className="space-y-1.5" aria-label="Primary navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${active ? 'bg-[#f5df55] text-[#272644] shadow-[3px_3px_0_#e5c93a]' : 'text-[#bdb9d0] hover:bg-[#383557] hover:text-[#fcf3d7]'}`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>
        {!collapsed && (
          <div className="mt-auto space-y-4">
            <div className="rounded-2xl border border-[#4a4666] bg-[#302e4e] p-4">
              <div className="mb-3 flex items-center gap-2 text-[#f5df55]"><CircleHelp size={15} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.16em]">study tip</span></div>
              <p className="font-display text-[17px] leading-snug text-[#fcf3d7]">The best answer is the one you can explain without looking.</p>
              <div className="mt-4 h-1 rounded-full bg-[#4d496a]"><div className="h-1 w-[68%] rounded-full bg-[#f5df55]" /></div>
              <p className="mt-2 text-[11px] text-[#aaa6c3]">3 day learning streak</p>
            </div>
            <div className="flex items-center gap-3 border-t border-[#454261] pt-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ef8065] text-xs font-extrabold text-[#272644]">MP</div>
              <div><p className="text-xs font-bold text-[#fcf3d7]">Maya Patel</p><p className="text-[10px] text-[#aaa6c3]">Curious by default</p></div>
            </div>
          </div>
        )}
      </aside>
      <div className="md:hidden">
        <div className="flex items-center justify-between border-b border-[#ded6c4] bg-[#f7f1e3] px-5 py-4">
          <BrandMark small />
          <button type="button" aria-label="Open navigation" data-testid="button-open-navigation" onClick={() => setMobileNav(true)} className="rounded-xl border border-[#ded6c4] bg-[#fcf8ed] p-2.5 text-[#292744]"><Menu size={19} /></button>
        </div>
        {mobileNav && (
          <div className="fixed inset-0 z-50 bg-[#272644] p-5 text-[#fcf3d7]">
            <div className="flex items-center justify-between"><BrandMark small /><button type="button" aria-label="Close navigation" data-testid="button-close-navigation" onClick={() => setMobileNav(false)} className="rounded-xl bg-[#383557] p-2"><X size={19} /></button></div>
            <nav className="mt-10 space-y-2">
              {navigation.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} data-testid={`mobile-link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`flex items-center gap-3 rounded-xl px-4 py-3.5 font-semibold ${location === href ? 'bg-[#f5df55] text-[#272644]' : 'text-[#bdb9d0]'}`}><Icon size={18} />{label}</Link>)}
            </nav>
          </div>
        )}
      </div>
      <main className={`min-h-[100dvh] transition-[margin] duration-300 ${collapsed ? 'md:ml-[84px]' : 'md:ml-[246px]'}`}>
        <div className="mx-auto min-h-[100dvh] max-w-[1420px]">{children}</div>
      </main>
      <div className="fixed bottom-5 right-5 z-30 hidden items-center gap-2 rounded-full border border-[#dfd5c0] bg-[#fcf8ed]/90 px-3 py-2 text-[10px] font-semibold text-[#69647d] shadow-sm backdrop-blur sm:flex">
        <span className={`h-2 w-2 rounded-full ${health.isError ? 'bg-[#ef8065]' : 'bg-[#75b89f]'}`} />
        {health.isError ? 'Connection needs attention' : 'Study Spark is ready'}
      </div>
      <div className="fixed right-5 top-5 z-30 flex items-center gap-2 rounded-full border border-[#dfd5c0] bg-[#fcf8ed]/90 px-2 py-1.5 shadow-sm backdrop-blur">
        {user ? (
          <>
            <span className="hidden max-w-[150px] truncate px-2 text-[10px] font-bold text-[#69647d] sm:inline">
              {user.firstName || user.primaryEmailAddress?.emailAddress}
            </span>
            <button
              type="button"
              data-testid="button-sign-out"
              onClick={() => signOut({ redirectUrl: basePath || '/' })}
              className="rounded-full bg-[#292744] px-3 py-1.5 text-[10px] font-bold text-[#f8efcf] hover:bg-[#403b59]"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link href="/sign-in" data-testid="link-sign-in" className="rounded-full bg-[#292744] px-3.5 py-2 text-[10px] font-bold text-[#f8efcf] hover:bg-[#403b59]">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {modes.map(({ key, label, icon: Icon }) => (
        <button key={key} type="button" data-testid={`button-mode-${key}`} onClick={() => onChange(key)} className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-all ${mode === key ? 'border-[#292744] bg-[#292744] text-[#f8efcf] shadow-[2px_2px_0_#ef8065]' : 'border-[#ded6c4] bg-[#fcf8ed] text-[#77718a] hover:border-[#aaa4bb] hover:text-[#292744]'}`}><Icon size={14} />{label}</button>
      ))}
    </div>
  );
}

function SourceCard({ source, index }: { source: ResearchSource; index: number }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" data-testid={`link-source-${index}`} className="group block rounded-2xl border border-[#e0d7c5] bg-[#fcf8ed] p-4 transition-transform hover:-translate-y-0.5 hover:border-[#aaa4bb]">
      <div className="mb-3 flex items-center justify-between gap-3"><span className="font-mono-ui text-[10px] font-medium uppercase tracking-[0.12em] text-[#857d92]">{source.domain}</span><ArrowUpRight size={15} className="text-[#9a94aa] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
      <h3 className="font-display text-[18px] leading-tight text-[#292744]">{source.title}</h3>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[#77718a]">{source.snippet}</p>
    </a>
  );
}

function AnswerPanel({ answer }: { answer: StudyAnswer }) {
  return (
    <div className="animate-rise space-y-5">
      <div className="rounded-[24px] border border-[#e0d7c5] bg-[#fcf8ed] p-5 shadow-[0_10px_30px_rgba(61,52,91,.06)] sm:p-7">
        <div className="mb-5 flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#f5df55] text-[#292744]"><Sparkles size={16} /></div><span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#857d92]">spark&apos;s take</span></div>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-7 text-[#403b59]">{answer.reply}</div>
      </div>
      {answer.sources?.length > 0 && <section><div className="mb-3 flex items-center gap-2"><FileText size={15} className="text-[#ef8065]" /><h2 className="font-mono-ui text-[10px] font-medium uppercase tracking-[0.18em] text-[#857d92]">checked against {answer.sources.length} sources</h2></div><div className="grid gap-3 sm:grid-cols-2">{answer.sources.map((source, index) => <SourceCard key={`${source.url}-${index}`} source={source} index={index} />)}</div></section>}
    </div>
  );
}

function Composer({ mode, subject, onSubjectChange, onSubmit, value, onChange, pending, compact = false }: { mode: Mode; subject: string; onSubjectChange: (subject: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; value: string; onChange: (value: string) => void; pending: boolean; compact?: boolean }) {
  return (
    <form onSubmit={onSubmit} className={`rounded-[24px] border border-[#cfc6b2] bg-[#fcf8ed] p-3 shadow-[0_12px_35px_rgba(61,52,91,.08)] ${compact ? '' : 'sm:p-4'}`}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} data-testid="input-study-question" rows={compact ? 2 : 3} placeholder="What are you working through?" className="w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] leading-6 text-[#292744] outline-none placeholder:text-[#a09aab]" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#e8dfce] pt-3">
        <div className="flex items-center gap-2">
          <select value={subject} onChange={(event) => onSubjectChange(event.target.value)} data-testid="select-subject" className="rounded-full border border-[#e0d7c5] bg-[#f7f1e3] px-3 py-2 text-[11px] font-semibold text-[#69647d] outline-none focus:border-[#ef8065]"><option value="">Any subject</option><option value="Mathematics">Mathematics</option><option value="Biology">Biology</option><option value="History">History</option><option value="Computer science">Computer science</option><option value="Literature">Literature</option></select>
          <span className="hidden text-[11px] text-[#9c96a7] sm:inline">Mode: <strong className="text-[#69647d]">{modes.find((item) => item.key === mode)?.label}</strong></span>
        </div>
        <button type="submit" disabled={pending || !value.trim()} data-testid="button-send-study-question" className="flex items-center gap-2 rounded-full bg-[#ef8065] px-4 py-2.5 text-xs font-extrabold text-[#292744] transition-all hover:bg-[#f39178] disabled:cursor-not-allowed disabled:opacity-40"><Send size={14} />{pending ? 'Thinking' : 'Ask Spark'}</button>
      </div>
    </form>
  );
}

function Home() {
  const [mode, setMode] = useState<Mode>('learn');
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [answer, setAnswer] = useState<StudyAnswer | null>(null);
  const [error, setError] = useState('');
  const ask = useAskStudyAssistant();
  const hasAsked = turns.length > 0 || Boolean(answer);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = question.trim();
    if (!message || ask.isPending) return;
    setError('');
    const nextTurns = [...turns, { role: 'user' as const, content: message }];
    setTurns(nextTurns);
    setQuestion('');
    ask.mutate({ data: { message, subject: subject || undefined, mode, history: turns } }, {
      onSuccess: (result) => { setAnswer(result); setTurns([...nextTurns, { role: 'assistant', content: result.reply }]); },
      onError: () => setError('Spark could not reach the study desk. Check your connection and try again.'),
    });
  };
  const askPrompt = (prompt: string, promptMode: Mode) => { setMode(promptMode); setQuestion(prompt); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-testid="input-study-question"]')?.focus(), 0); };

  return (
    <div className="paper-grid min-h-[100dvh] px-5 pb-10 pt-8 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-[1040px] items-start justify-between">
        <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.22em] text-[#92899d]">Tuesday, 14 May · 09:41</p><h1 className="mt-2 font-display text-[34px] leading-none tracking-[-0.03em] text-[#292744] sm:text-[45px]">Good morning, Maya<span className="text-[#ef8065]">.</span></h1></div>
        <div className="hidden rounded-full border border-[#ded6c4] bg-[#fcf8ed] px-3 py-2 text-[10px] font-bold text-[#77718a] sm:flex sm:items-center sm:gap-2"><span className="h-2 w-2 rounded-full bg-[#75b89f]" />Focus mode on</div>
      </header>
      <div className="mx-auto mt-9 max-w-[1040px]">
        {!hasAsked ? (
          <div className="animate-rise">
            <div className="relative overflow-hidden rounded-[30px] bg-[#292744] px-6 py-8 text-[#fcf3d7] shadow-[7px_7px_0_#ded6c4] sm:px-10 sm:py-11">
              <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border-[28px] border-[#f5df55]/20" /><div className="absolute -bottom-28 right-28 h-48 w-48 rounded-full bg-[#ef8065]/20" />
              <div className="relative max-w-[590px]"><div className="mb-5 flex items-center gap-2 text-[#f5df55]"><Sparkles size={17} /><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em]">a little room to think</span></div><h2 className="font-display text-[35px] leading-[1.05] tracking-[-0.035em] sm:text-[51px]">Bring me the thing<br />that feels <em className="text-[#f5df55]">fuzzy.</em></h2><p className="mt-5 max-w-[440px] text-sm leading-6 text-[#bdb9d0]">Ask for the first step, the missing connection, or a better way to remember it. We&apos;ll take it apart together.</p></div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">{starterPrompts.map((item, index) => <button key={item.title} type="button" data-testid={`button-starter-prompt-${index}`} onClick={() => askPrompt(item.prompt, item.mode)} className={`group min-h-[144px] rounded-[22px] border border-[#ded6c4] p-5 text-left transition-transform hover:-translate-y-1 ${item.accent === 'yellow' ? 'bg-[#f5df55]' : item.accent === 'coral' ? 'bg-[#ef8065]' : 'bg-[#b6d8c5]'}`}><div className="flex items-center justify-between"><span className="font-mono-ui text-[10px] uppercase tracking-[0.15em] text-[#292744]/60">0{index + 1}</span><ChevronRight size={17} className="transition-transform group-hover:translate-x-1" /></div><p className="mt-8 font-display text-[21px] leading-tight text-[#292744]">{item.title}</p><p className="mt-1 text-xs font-medium text-[#292744]/65">{item.prompt}</p></button>)}</div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between"><div><span className="font-mono-ui text-[10px] uppercase tracking-[0.2em] text-[#92899d]">current thread</span><h2 className="mt-1 font-display text-3xl text-[#292744]">Let&apos;s work it through.</h2></div><button type="button" data-testid="button-new-thread" onClick={() => { setTurns([]); setAnswer(null); setError(''); }} className="rounded-full border border-[#d8cfbd] bg-[#fcf8ed] px-3.5 py-2 text-xs font-bold text-[#69647d] hover:border-[#292744]">New thread</button></div>
            {turns.map((turn, index) => <div key={`${turn.role}-${index}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}><div data-testid={`text-chat-turn-${index}`} className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${turn.role === 'user' ? 'bg-[#292744] text-[#f8efcf]' : 'border border-[#ded6c4] bg-[#fcf8ed] text-[#504a65]'}`}>{turn.content}</div></div>)}
            {ask.isPending && <div className="flex items-center gap-2 rounded-2xl border border-[#ded6c4] bg-[#fcf8ed] px-4 py-4 text-xs text-[#857d92]"><span className="h-2 w-2 animate-pulse-soft rounded-full bg-[#ef8065]" /><span className="h-2 w-24 animate-pulse-soft rounded-full bg-[#e4dac9]" /><span className="h-2 w-12 animate-pulse-soft rounded-full bg-[#e4dac9]" /></div>}
            {error && <div className="flex items-center justify-between rounded-2xl border border-[#ef8065]/40 bg-[#fff0e9] px-4 py-3 text-xs text-[#a94e46]"><span>{error}</span><button type="button" data-testid="button-retry-study" onClick={() => setQuestion(turns[turns.length - 1]?.content ?? '')} className="font-bold underline">Try again</button></div>}
            {answer && !ask.isPending && <AnswerPanel answer={answer} />}
          </div>
        )}
        <div className={`${hasAsked ? 'mt-8' : 'mt-8'} mx-auto max-w-[780px]`}><ModeSelector mode={mode} onChange={setMode} /><div className="mt-3"><Composer mode={mode} subject={subject} onSubjectChange={setSubject} onSubmit={submit} value={question} onChange={setQuestion} pending={ask.isPending} /></div><p className="mt-3 text-center text-[10px] text-[#a09aab]">Spark can make mistakes. Sources are shown when a response uses public research.</p></div>
      </div>
    </div>
  );
}

function Research() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const params = useMemo(() => ({ query }), [query]);
  const search = useSearchResearch(params, { query: { enabled: query.length >= 2, queryKey: getSearchResearchQueryKey(params) } });
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (input.trim().length >= 2) setQuery(input.trim()); };
  const quickSearches = ['How does spaced repetition work?', 'The water cycle for beginners', 'Women in computer science'];
  const resultView = search.isLoading
    ? <div className="grid gap-3 sm:grid-cols-2"><div className="h-40 animate-pulse rounded-2xl bg-[#ebe2d0]" /><div className="h-40 animate-pulse rounded-2xl bg-[#ebe2d0]" /></div>
    : search.isError
      ? <div className="rounded-2xl border border-[#ef8065]/40 bg-[#fff0e9] p-6"><p className="font-display text-xl text-[#a94e46]">The desk is quiet right now.</p><p className="mt-2 text-sm text-[#a94e46]/80">We could not load sources for this search.</p><button type="button" data-testid="button-retry-research" onClick={() => search.refetch()} className="mt-4 flex items-center gap-2 rounded-full bg-[#ef8065] px-4 py-2 text-xs font-bold text-[#292744]"><RefreshCw size={13} />Try again</button></div>
      : search.data?.length
        ? <div className="grid gap-3 sm:grid-cols-2">{search.data.map((source, index) => <SourceCard key={`${source.url}-${index}`} source={source} index={index} />)}</div>
        : <div className="rounded-[22px] border border-dashed border-[#cfc6b2] bg-[#fcf8ed] p-10 text-center"><Search size={26} className="mx-auto text-[#aaa3b1]" /><p className="mt-3 font-display text-xl text-[#504a65]">No sources surfaced yet.</p><p className="mt-1 text-sm text-[#857d92]">Try a broader question or a different phrase.</p></div>;
  return (
    <div className="min-h-[100dvh] px-5 pb-12 pt-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1040px]">
        <div className="flex items-end justify-between gap-4"><div><p className="font-mono-ui text-[10px] uppercase tracking-[0.22em] text-[#92899d]">the research desk</p><h1 className="mt-2 font-display text-[42px] leading-none tracking-[-0.03em] text-[#292744] sm:text-[55px]">Follow the thread<span className="text-[#ef8065]">.</span></h1><p className="mt-4 max-w-[520px] text-sm leading-6 text-[#77718a]">Find public educational sources worth your time. Spark brings the signal; you decide what sticks.</p></div><div className="hidden rounded-[22px] bg-[#b6d8c5] p-4 sm:block"><Globe2 size={27} className="text-[#292744]" /><p className="mt-8 font-mono-ui text-[9px] uppercase tracking-[0.14em] text-[#292744]/65">open web<br />curated for you</p></div></div>
        <form onSubmit={submit} className="mt-9 flex rounded-[18px] border border-[#cfc6b2] bg-[#fcf8ed] p-2 shadow-[0_10px_25px_rgba(61,52,91,.06)]"><Search className="ml-3 mt-2.5 shrink-0 text-[#8f899c]" size={19} /><input value={input} onChange={(event) => setInput(event.target.value)} data-testid="input-research-query" placeholder="Search a concept, question, or topic" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[#292744] outline-none placeholder:text-[#aaa3b1]" /><button type="submit" data-testid="button-search-research" disabled={input.trim().length < 2 || search.isFetching} className="rounded-xl bg-[#292744] px-4 py-2.5 text-xs font-bold text-[#f8efcf] transition-colors hover:bg-[#403b59] disabled:opacity-40">Search</button></form>
        {!query && <div className="mt-5 flex flex-wrap gap-2">{quickSearches.map((item, index) => <button key={item} type="button" data-testid={`button-quick-search-${index}`} onClick={() => { setInput(item); setQuery(item); }} className="rounded-full border border-[#ded6c4] bg-[#fcf8ed] px-3.5 py-2 text-[11px] font-semibold text-[#77718a] hover:border-[#292744] hover:text-[#292744]">{item}</button>)}</div>}
        <div className="mt-10">
          {query ? (
            <><div className="mb-5 flex items-center justify-between"><div><span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#92899d]">results for</span><h2 className="mt-1 font-display text-2xl text-[#292744]">“{query}”</h2></div>{search.data && <span className="rounded-full bg-[#f5df55] px-3 py-1.5 font-mono-ui text-[10px] text-[#292744]">{search.data.length} sources</span>}</div>{resultView}</>
          ) : (
            <div className="rounded-[28px] border border-[#ded6c4] bg-[#292744] p-7 text-[#fcf3d7] sm:p-10"><div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#f5df55] text-[#292744]"><FlaskConical size={22} /></div><h2 className="mt-8 max-w-[480px] font-display text-[34px] leading-[1.06] tracking-[-0.025em]">Start with a question you actually want answered.</h2><p className="mt-4 max-w-[480px] text-sm leading-6 text-[#bdb9d0]">Search results are a starting point, not a finish line. Open the source, scan the evidence, make the connection.</p></div>
          )}
        </div>
      </div>
    </div>
   );
}

function Settings() {
  const [subject, setSubject] = useState(() => localStorage.getItem('spark-subject') || 'Mathematics');
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('spark-mode') as Mode) || 'learn');
  const [sources, setSources] = useState(true);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 60_000 } });
  const save = (key: string, value: string) => { localStorage.setItem(key, value); };
  return (
    <div className="min-h-[100dvh] px-5 pb-12 pt-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-[860px]"><p className="font-mono-ui text-[10px] uppercase tracking-[0.22em] text-[#92899d]">make it yours</p><h1 className="mt-2 font-display text-[42px] leading-none tracking-[-0.03em] text-[#292744] sm:text-[55px]">Your study rhythm<span className="text-[#ef8065]">.</span></h1><p className="mt-4 max-w-[540px] text-sm leading-6 text-[#77718a]">A few gentle defaults help Spark meet you where you are. You can change these anytime.</p>
      <div className="mt-10 space-y-5">
        <section className="rounded-[24px] border border-[#ded6c4] bg-[#fcf8ed] p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#92899d]">01 · home base</span><h2 className="mt-2 font-display text-2xl text-[#292744]">What are you exploring?</h2><p className="mt-1 text-sm text-[#857d92]">We&apos;ll use this to make first suggestions feel relevant.</p></div><BookOpen className="text-[#ef8065]" size={23} /></div><select value={subject} onChange={(event) => { setSubject(event.target.value); save('spark-subject', event.target.value); }} data-testid="select-preferred-subject" className="mt-6 w-full rounded-xl border border-[#ded6c4] bg-[#f7f1e3] px-4 py-3 text-sm font-semibold text-[#292744] outline-none focus:border-[#ef8065]"><option>Mathematics</option><option>Biology</option><option>History</option><option>Computer science</option><option>Literature</option><option>Languages</option></select></section>
        <section className="rounded-[24px] border border-[#ded6c4] bg-[#fcf8ed] p-6 sm:p-8"><span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#92899d]">02 · default mode</span><h2 className="mt-2 font-display text-2xl text-[#292744]">How should Spark show up?</h2><div className="mt-5 grid gap-2 sm:grid-cols-2">{modes.map(({ key, label, description, icon: Icon }) => <button type="button" key={key} data-testid={`button-preference-mode-${key}`} onClick={() => { setMode(key); save('spark-mode', key); }} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${mode === key ? 'border-[#292744] bg-[#292744] text-[#f8efcf]' : 'border-[#ded6c4] hover:border-[#aaa4bb]'}`}><div className={`mt-0.5 rounded-lg p-2 ${mode === key ? 'bg-[#f5df55] text-[#292744]' : 'bg-[#f5df55]/50 text-[#292744]'}`}><Icon size={16} /></div><div><p className="text-sm font-bold">{label}</p><p className={`mt-1 text-xs ${mode === key ? 'text-[#bdb9d0]' : 'text-[#857d92]'}`}>{description}</p></div>{mode === key && <Check className="ml-auto mt-1 text-[#f5df55]" size={16} />}</button>)}</div></section>
        <section className="rounded-[24px] border border-[#ded6c4] bg-[#fcf8ed] p-6 sm:p-8"><span className="font-mono-ui text-[10px] uppercase tracking-[0.18em] text-[#92899d]">03 · source preference</span><div className="mt-2 flex items-center justify-between gap-4"><div><h2 className="font-display text-2xl text-[#292744]">Show source cards</h2><p className="mt-1 text-sm text-[#857d92]">Keep the evidence visible beneath research-backed answers.</p></div><button type="button" role="switch" aria-checked={sources} data-testid="button-toggle-sources" onClick={() => setSources(!sources)} className={`relative h-7 w-12 rounded-full transition-colors ${sources ? 'bg-[#75b89f]' : 'bg-[#c8c0b0]'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-[#fcf8ed] shadow-sm transition-transform ${sources ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section>
        <div className="flex items-center gap-3 rounded-2xl border border-[#ded6c4] bg-[#b6d8c5]/50 px-5 py-4 text-sm text-[#504a65]"><span className={`h-2.5 w-2.5 rounded-full ${health.isError ? 'bg-[#ef8065]' : 'bg-[#75b89f]'}`} /><span>{health.isError ? 'Study desk connection is offline.' : 'Study desk connection is healthy.'}</span><span className="ml-auto font-mono-ui text-[10px] uppercase tracking-[0.12em] text-[#77718a]">{health.data?.status || 'ready'}</span></div>
       </div>
     </div>
     </div>
   );
}

function SignInPage() {
  return (
    <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#f7f1e3] px-4 py-8">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#f7f1e3] px-4 py-8">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/">
          <Shell><Home /></Shell>
        </Route>
        <Route path="/research">
          <Shell><Research /></Shell>
        </Route>
        <Route path="/settings">
          <Shell><Settings /></Shell>
        </Route>
        <Route>
          <Shell><NotFound /></Shell>
        </Route>
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to continue your study rhythm',
          },
        },
        signUp: {
          start: {
            title: 'Create your study space',
            subtitle: 'Keep your learning momentum in one place',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  if (!clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  }

  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;