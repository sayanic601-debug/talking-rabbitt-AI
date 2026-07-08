import { useEffect, useState, useRef, type FormEvent } from 'react'
import rabbitIcon from '../talking-rabbit-icon.jpeg'
import AutoDashboard from './components/AutoDashboard'
import DataVisualizer from './components/DataVisualizer'

type View =
  | 'landing'
  | 'login'
  | 'register'
  | 'dashboard'
  | 'profile'
  | 'settings'
  | 'privacy'
  | 'help'

type IngestionStage = 'idle' | 'ingesting' | 'schema' | 'synced'

type Message = {
  role: 'assistant' | 'user'
  text: string
  kpis?: Array<{ label: string; value: string; trend?: 'up' | 'down'; change?: string }>
  graph?: {
    type: 'line' | 'bar' | 'horizontalBar' | 'pie' | 'donut' | 'area' | 'scatter' | 'heatmap' | 'radar' | 'funnel' | 'waterfall' | 'none'
    title: string
    data: Array<{ label?: string; value?: number; x?: string | number; y?: string | number; forecast?: boolean }>
  }
  nextQuestions?: string[]
}

const STORAGE_KEY = 'talking-rabbit-view'
const STORAGE_MESSAGES_KEY = 'talking-rabbit-messages'

function App() {
  const [view, setView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'landing'
    const stored = window.localStorage.getItem(STORAGE_KEY) as View | null
    return stored ?? 'landing'
  })
  const [ingestionStage, setIngestionStage] = useState<IngestionStage>('idle')
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    const stored = window.localStorage.getItem(STORAGE_MESSAGES_KEY)
    if (!stored) return []
    try {
      return JSON.parse(stored) as Message[]
    } catch {
      return []
    }
  })
  const [prompt, setPrompt] = useState('')
  const [datasetInfo, setDatasetInfo] = useState<any>(null)
  const [isQuerying, setIsQuerying] = useState(false)
  const [errorAlert, setErrorAlert] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerCompany, setRegisterCompany] = useState('')
  
  const [userSession, setUserSession] = useState<{
    name: string
    email: string
    company: string
    role: string
    photoUrl?: string
  }>(() => {
    if (typeof window === 'undefined') {
      return { name: 'Aisha Patel', email: 'aisha@northstar.ai', company: 'Northstar Labs', role: 'VP Strategy' }
    }
    const stored = window.localStorage.getItem('talking-rabbit-session')
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch {
        // Fallback
      }
    }
    return { name: 'Aisha Patel', email: 'aisha@northstar.ai', company: 'Northstar Labs', role: 'VP Strategy' }
  })

  useEffect(() => {
    window.localStorage.setItem('talking-rabbit-session', JSON.stringify(userSession))
  }, [userSession])

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const [aiModel, setAiModel] = useState(() => {
    if (typeof window === 'undefined') return 'Forecast Pro'
    return window.localStorage.getItem('talking-rabbit-aimodel') ?? 'Forecast Pro'
  })
  const [slackConnected, setSlackConnected] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem('talking-rabbit-slack')
    return stored !== 'false'
  })
  const [reportCadence, setReportCadence] = useState(() => {
    if (typeof window === 'undefined') return 'Every Monday'
    return window.localStorage.getItem('talking-rabbit-cadence') ?? 'Every Monday'
  })
  const [settingsSavedAlert, setSettingsSavedAlert] = useState(false)

  const [supportChatOpen, setSupportChatOpen] = useState(false)
  const [supportMessages, setSupportMessages] = useState<Array<{ role: 'agent' | 'user'; text: string }>>([
    { role: 'agent', text: "Hi! I'm your Rabbit Support assistant. How can I help you today?" }
  ])
  const [supportInput, setSupportInput] = useState('')
  const [supportAgentTyping, setSupportAgentTyping] = useState(false)

  const [registerPhotoUrl, setRegisterPhotoUrl] = useState('')

  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editPhotoUrl, setEditPhotoUrl] = useState('')

  const handleStartEditProfile = () => {
    setEditName(userSession.name)
    setEditRole(userSession.role)
    setEditCompany(userSession.company)
    setEditPhotoUrl(userSession.photoUrl || '')
    setIsEditingProfile(true)
  }

  const handleSaveSettings = () => {
    window.localStorage.setItem('talking-rabbit-aimodel', aiModel)
    window.localStorage.setItem('talking-rabbit-slack', slackConnected ? 'true' : 'false')
    window.localStorage.setItem('talking-rabbit-cadence', reportCadence)
    
    setSettingsSavedAlert(true)
    setTimeout(() => {
      setSettingsSavedAlert(false)
    }, 3000)
  }

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view)
  }, [view])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages))
  }, [messages])

  const navigate = (nextView: View) => setView(nextView)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setErrorAlert(null)
    setIngestionStage('ingesting')
    
    console.log(`[FRONTEND] Upload request initiated for file: "${file.name}" (${file.size} bytes, type: "${file.type}")`);
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      let response;
      try {
        response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
      } catch (networkError: any) {
        console.error("[FRONTEND] Network error during upload:", networkError);
        throw new Error("Backend server is not reachable.");
      }
      
      console.log(`[FRONTEND] Upload response received with status: ${response.status} ${response.statusText}`);
      
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!response.ok) {
        let errorMessage = "Upload endpoint returned an error.";
        if (isJson) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.detail || errorMessage;
            if (errorMessage.includes("parsing") || errorMessage.includes("parse") || errorMessage.includes("empty")) {
              errorMessage = "CSV parsing failed.";
            }
          } catch (e) {
            console.error("[FRONTEND] Failed to parse JSON error details:", e);
          }
        } else {
          const rawText = await response.text().catch(() => "");
          console.warn("[FRONTEND] Non-JSON error body:", rawText);
        }
        throw new Error(errorMessage);
      }
      
      if (!isJson) {
        console.error("[FRONTEND] Expected JSON response but received content-type:", contentType);
        throw new Error("Invalid response from server.");
      }
      
      const responseData = await response.json();
      console.log("[FRONTEND] Upload success response:", responseData);
      
      if (!responseData || typeof responseData !== 'object' || responseData.success === false) {
        const errorMsg = responseData?.error || "Invalid response from server.";
        throw new Error(errorMsg);
      }
      
      const data = responseData.data;
      if (!data) {
        throw new Error("Invalid response from server.");
      }
      
      setIngestionStage('schema')
      
      window.setTimeout(() => {
        setDatasetInfo(data)
        setIngestionStage('synced')
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            text: `Successfully ingested **${data.filename}** with **${data.rowCount} rows**. Primary numeric metric: \`${data.numericColumns[0]}\`. Ask me to forecast or analyze drops!`,
          }
        ])
      }, 800)
      
    } catch (err: any) {
      console.error("[FRONTEND] CSV upload process failed:", err.message);
      setIngestionStage('idle')
      setErrorAlert(err.message || 'An error occurred during file upload.')
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: `❌ Ingestion failed: ${err.message || 'An error occurred. Please ensure your file is a valid CSV.'}`
        }
      ])
    } finally {
      if (event.target) {
        event.target.value = ''
      }
    }
  }

  const executeQuery = async (queryText: string) => {
    if (!queryText.trim() || isQuerying) return
    
    setMessages((current) => [
      ...current,
      { role: 'user', text: queryText }
    ])
    
    setIsQuerying(true)
    console.log(`[FRONTEND] Submitting query: "${queryText}"`);
    
    try {
      let response;
      try {
        response = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prompt: queryText })
        });
      } catch (networkError: any) {
        console.error("[FRONTEND] Network error during query:", networkError);
        throw new Error("Backend server is not reachable.");
      }
      
      console.log(`[FRONTEND] Query response status: ${response.status} ${response.statusText}`);
      
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!response.ok) {
        throw new Error("AI processing failed.");
      }
      
      if (!isJson) {
        throw new Error("Invalid response from server.");
      }
      
      const responseData = await response.json();
      console.log("[FRONTEND] Query response data received:", responseData);
      
      if (!responseData || responseData.success === false) {
        throw new Error(responseData?.error || "AI processing failed.");
      }
      
      const resData = responseData.data;
      
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: resData.text,
          kpis: resData.kpis,
          graph: resData.graph,
          nextQuestions: resData.nextQuestions
        }
      ])
    } catch (err: any) {
      console.error("[FRONTEND] Query prompt handler failed:", err.message);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: `⚠️ Failed to get a response from Rabbit: ${err.message || 'AI processing failed.'}`
        }
      ])
    } finally {
      setIsQuerying(false)
    }
  }

  const handlePrompt = async (event: FormEvent) => {
    event.preventDefault()
    executeQuery(prompt)
    setPrompt('')
  }

  const renderLanding = () => (
    <div className="min-h-screen bg-[#05070B] text-white">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <button className="flex items-center gap-3" onClick={() => navigate('dashboard')}>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00C48C]">
            <RabbitIcon />
          </span>
          <span className="text-xl font-semibold tracking-tight text-white">Talking Rabbitt</span>
        </button>
        <nav className="flex items-center gap-4 text-sm text-slate-300">
          <button className="transition hover:text-white" onClick={() => navigate('login')}>
            Log in
          </button>
          <button
            className="rounded-full bg-[#00C48C] px-4 py-2 font-medium text-[#03110c] transition hover:bg-[#00A877]"
            onClick={() => navigate('register')}
          >
            Get Started
          </button>
        </nav>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pb-16 lg:px-8">
        <section className="rounded-[36px] border border-white/10 bg-[#0D121F] p-8 shadow-2xl shadow-black/20 lg:p-14">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex rounded-full border border-[#00C48C]/30 bg-[#00C48C]/10 px-3 py-1 text-sm font-medium text-[#67f0c3]">
                New: Generative AI Forecasting is Live
              </div>
              <h1 className="text-5xl font-semibold leading-[0.9] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Data Speaks.{' '}
                <span className="bg-gradient-to-r from-[#00C48C] to-[#8B5CF6] bg-clip-text text-transparent">
                  Rabbit Listens.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
                Stop digging through spreadsheets. Talking Rabbit uses advanced AI to turn your raw data into natural language insights and predictive business strategies.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  className="rounded-full bg-[#00C48C] px-6 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877]"
                  onClick={() => navigate('register')}
                >
                  Get Started Free ➔
                </button>
                <button
                  className="rounded-full border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/5"
                  onClick={() => navigate('dashboard')}
                >
                  ▶ Watch Demo
                </button>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-5">
                <div className="flex -space-x-3">
                  {[0, 1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#0D121F] text-sm font-semibold"
                      style={{
                        background: ['#00C48C', '#8B5CF6', '#D97706', '#06b6d4'][item],
                      }}
                    >
                      {['A', 'K', 'T', 'N'][item]}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-lg font-semibold text-white">Joined by 2,000+ teams</div>
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    ENTERPRISE READY FROM DAY ONE
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/10 bg-[#0E131F] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div className="rounded-[28px] border border-white/10 bg-[#111827] p-8">
                <div className="mx-auto flex h-56 w-full max-w-sm items-center justify-center rounded-[24px] bg-white p-6">
                  <div className="rounded-[24px] border border-black/10 bg-[#f4f4f5] p-8">
                    <RabbitIcon solid={true} className="h-32 w-32 text-black" />
                  </div>
                </div>
                <div className="mt-6 grid gap-3">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0D121F] px-4 py-3">
                    <span className="text-sm text-slate-400">Live signal</span>
                    <span className="text-sm font-semibold text-[#00C48C]">+14.8%</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0D121F] px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-[#00C48C]" />
                    <div className="h-2 flex-1 rounded-full bg-slate-800">
                      <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-[#00C48C] to-[#8B5CF6]" />
                    </div>
                    <span className="text-sm text-slate-400">94% tune</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0D121F] px-4 py-3">
                    <div className="h-3 w-3 rounded-full bg-[#D97706]" />
                    <div className="h-2 flex-1 rounded-full bg-slate-800">
                      <div className="h-2 w-2/3 rounded-full bg-[#D97706]" />
                    </div>
                    <span className="text-sm text-slate-400">Forecast</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[#0D121F] px-8 py-8 text-center">
          <div className="mb-8 text-xs uppercase tracking-[0.35em] text-slate-500">
            TRUSTED BY DATA-DRIVEN ENTERPRISES WORLDWIDE
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {['ApexCorp', 'QuantumLogic', 'VertexData', 'NexusGlobal', 'EcoStream'].map((logo) => (
              <div key={logo} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">
                {logo}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-[#0D121F] px-8 py-14 lg:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Everything you need to{' '}
              <span className="text-[#00C48C]">Scale</span>
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-400">
              We combine the power of traditional BI with the speed of Generative AI to give you a competitive edge.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${feature.iconClass}`}>
                  <span className="text-lg text-white">{feature.icon}</span>
                </div>
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{feature.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-r from-[#00C48C]/10 via-[#0E131F] to-[#8B5CF6]/10 px-8 py-8 lg:px-12">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[24px] border border-white/10 bg-[#0D121F]/80 p-6">
                <div className={`text-4xl font-semibold ${stat.color}`}>{stat.value}</div>
                <div className="mt-2 text-sm uppercase tracking-[0.3em] text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0D121F] via-[#0E131F] to-[#06131d] px-8 py-10 lg:px-12">
          <div className="mx-auto max-w-4xl rounded-[28px] border border-white/10 bg-[#05070B]/80 p-8 text-center shadow-2xl shadow-black/20">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to let your data talk?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-400">
              Join hundreds of forward-thinking companies already using Talking Rabbits to outpace their competition.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button className="rounded-full bg-[#00C48C] px-6 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877]">
                Start Your 14-Day Free Trial
              </button>
              <button className="rounded-full border border-white/15 bg-white/5 px-6 py-3 font-semibold text-slate-200 transition hover:bg-white/10">
                Contact Sales
              </button>
            </div>
            <p className="mt-5 text-sm text-slate-500">No credit card required. Cancel anytime.</p>
          </div>
        </section>

        <footer className="rounded-[32px] border border-white/10 bg-[#0D121F] px-8 py-10 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00C48C]">
                  <RabbitIcon />
                </span>
                <span className="text-xl font-semibold text-white">Talking Rabbitt</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-7 text-slate-400">
                Revolutionizing Business Intelligence through generative AI and predictive analytics.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Product</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-500">
                <li>Features</li>
                <li>Pricing</li>
                <li>Security</li>
                <li>Enterprise</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Resources</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-500">
                <li>Documentation</li>
                <li>API Reference</li>
                <li>Blog</li>
                <li>Community</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">Company</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-500">
                <li>About Us</li>
                <li>Careers</li>
                <li>Privacy Policy</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )

  const renderPanel = (title: string, subtitle: string, children: React.ReactNode) => (
    <div className="min-h-screen bg-[#05070B] px-6 py-8 text-white lg:px-8">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 rounded-full border border-white/10 bg-[#0D121F]/80 px-5 py-3">
        <button className="flex items-center gap-3" onClick={() => navigate('landing')}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00C48C]">
            <RabbitIcon />
          </span>
          <span className="text-lg font-semibold text-white">Talking Rabbitt</span>
        </button>
        <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
          {[
            ['dashboard', 'Dashboard'],
            ['profile', 'Profile'],
            ['settings', 'Settings'],
            ['privacy', 'Privacy'],
            ['help', 'Help'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-full px-3 py-2 transition ${view === key ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`}
              onClick={() => navigate(key as View)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto mt-8 max-w-7xl rounded-[32px] border border-white/10 bg-[#0D121F] p-8 shadow-2xl shadow-black/30 lg:p-12">
        <div className="mb-8">
          <div className="text-sm uppercase tracking-[0.35em] text-[#00C48C]">{title}</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">{subtitle}</h2>
        </div>
        {children}
      </main>
    </div>
  )

  const renderLogin = () => {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault()
      const email = loginEmail.trim() || 'alex@northstar.ai'
      const username = email.split('@')[0]
      const capitalizedName = username.charAt(0).toUpperCase() + username.slice(1)
      setUserSession({
        name: capitalizedName,
        email: email,
        company: 'Northstar Labs',
        role: 'Strategy Director'
      })
      navigate('dashboard')
    }

    return renderPanel('Secure Access', 'Sign in to your workspace', <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <form onSubmit={handleLogin} className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
        <label className="mb-2 block text-sm text-slate-400">Email address</label>
        <input 
          className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-4 py-3 text-white outline-none focus:border-[#00C48C]/40 transition" 
          placeholder="alex@northstar.ai"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
        />
        <label className="mt-5 mb-2 block text-sm text-slate-400">Password</label>
        <input 
          className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-4 py-3 text-white outline-none focus:border-[#00C48C]/40 transition" 
          type="password" 
          placeholder="••••••••"
          value={loginPassword}
          onChange={(e) => setLoginPassword(e.target.value)}
        />
        <button className="mt-6 w-full rounded-full bg-[#00C48C] px-6 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877] cursor-pointer" type="submit">Sign in</button>
      </form>
      <div className="rounded-[24px] border border-[#00C48C]/20 bg-[#00C48C]/10 p-7 text-slate-300">
        <h3 className="text-xl font-semibold text-white">Secure controls</h3>
        <p className="mt-3 leading-7">Multi-factor authentication, audit logs, and role-aware dashboards keep your team productive and protected.</p>
        <ul className="mt-5 space-y-3 text-sm">
          <li>• SAML and SCIM provisioning</li>
          <li>• Private data governance</li>
          <li>• Instant notification routing</li>
        </ul>
      </div>
    </div>)
  }

  const renderRegister = () => {
    const handleRegister = (e: React.FormEvent) => {
      e.preventDefault()
      const name = registerName.trim() || 'Mina Patel'
      const email = registerEmail.trim() || 'mina@acme.com'
      const company = registerCompany.trim() || 'Northstar Labs'
      setUserSession({
        name: name,
        email: email,
        company: company,
        role: 'Administrator',
        photoUrl: registerPhotoUrl || undefined
      })
      navigate('dashboard')
    }

    return renderPanel('Start Free', 'Create your AI-native analytics workspace', <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <form onSubmit={handleRegister} className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-sm text-slate-400">Full name</label>
          <input 
            className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-4 py-3 text-white outline-none focus:border-[#00C48C]/40 transition" 
            placeholder="Mina Patel"
            value={registerName}
            onChange={(e) => setRegisterName(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-slate-400">Work email</label>
          <input 
            className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-4 py-3 text-white outline-none focus:border-[#00C48C]/40 transition" 
            placeholder="mina@acme.com"
            value={registerEmail}
            onChange={(e) => setRegisterEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-slate-400">Company</label>
          <input 
            className="w-full rounded-2xl border border-white/10 bg-[#05070B] px-4 py-3 text-white outline-none focus:border-[#00C48C]/40 transition" 
            placeholder="Northstar Labs"
            value={registerCompany}
            onChange={(e) => setRegisterCompany(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm text-slate-400">Profile Photo (Optional)</label>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#00C48C] to-[#8B5CF6] text-xs font-semibold text-white overflow-hidden">
              {registerPhotoUrl ? (
                <img src={registerPhotoUrl} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                'Upload'
              )}
            </div>
            <input 
              type="file"
              accept="image/*"
              className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#00C48C]/15 file:text-[#67f0c3] hover:file:bg-[#00C48C]/25 cursor-pointer file:cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onloadend = () => {
                    setRegisterPhotoUrl(reader.result as string)
                  }
                  reader.readAsDataURL(file)
                }
              }}
            />
          </div>
        </div>
        <button className="mt-4 w-full rounded-full bg-[#00C48C] px-6 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877] cursor-pointer" type="submit">Create account</button>
      </form>
      <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 text-slate-300">
        <h3 className="text-xl font-semibold text-white">What gets installed</h3>
        <p className="mt-3 leading-7">Connect your data sources, activate predictive workflows, and give your team a single natural-language command surface.</p>
        <ul className="mt-5 space-y-3 text-sm">
          <li>• Unified ingestion pipeline</li>
          <li>• Forecasting and scenario planning</li>
          <li>• Embedded collaboration tools</li>
        </ul>
      </div>
    </div>)
  }

  const renderDashboard = () => renderPanel('Command Center', 'Agentic AI workflow for your latest data signal', <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-[#00C48C]">Enterprise BI Copilot</div>
          <h3 className="mt-2 text-2xl font-bold text-white">Data Signal Hub</h3>
        </div>
      </div>

      {/* Conditionally render compact active dataset info or full upload area */}
      {datasetInfo ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#05070B]/60 p-4 transition-all duration-300">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-bold">✓</span>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Active Signal</div>
              <div className="text-xs font-semibold text-white truncate max-w-[180px]" title={datasetInfo.filename}>{datasetInfo.filename}</div>
            </div>
          </div>
          <button 
            className="rounded-full bg-slate-800 border border-white/5 hover:bg-slate-750 px-3.5 py-1.5 text-xs text-slate-200 transition cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            disabled={ingestionStage === 'ingesting' || ingestionStage === 'schema'}
          >
            Change Dataset
          </button>
        </div>
      ) : (
        <button 
          className="mt-2 flex w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-[#00C48C]/40 bg-[#05070B]/70 px-6 py-8 text-center transition hover:border-[#00C48C] cursor-pointer" 
          onClick={() => fileInputRef.current?.click()}
          disabled={ingestionStage === 'ingesting' || ingestionStage === 'schema'}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00C48C] text-xl text-[#03110c]">
            {ingestionStage === 'ingesting' || ingestionStage === 'schema' ? '⏳' : '⬆'}
          </div>
          <div className="mt-3 text-base font-semibold text-white">Upload Business Signal</div>
          <div className="mt-1 text-xs text-slate-400">Click to select and ingest a CSV file</div>
        </button>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        accept=".csv" 
        className="hidden" 
        onChange={handleFileChange} 
      />

      {ingestionStage !== 'synced' && ingestionStage !== 'idle' && (
        <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Ingestion Pipeline</span>
            <span>{ingestionStage === 'ingesting' ? 'Ingesting data stream...' : 'Profiling schema and calculating quality...'}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800">
            <div className={`h-2 rounded-full bg-gradient-to-r from-[#00C48C] to-[#8B5CF6] transition-all duration-300 ${ingestionStage === 'ingesting' ? 'w-1/3' : 'w-2/3'}`} />
          </div>
        </div>
      )}

      {errorAlert && (
        <div className="p-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs leading-5">
          {errorAlert}
        </div>
      )}

      {datasetInfo && (
        <div className="mt-2 border-t border-white/5 pt-4">
          <AutoDashboard datasetInfo={datasetInfo} />
        </div>
      )}
    </div>

    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-500">BI Analytics Agent</div>
          <h3 className="mt-2 text-2xl font-bold text-white">Copilot Interface</h3>
        </div>
        <div className="rounded-full border border-[#00C48C]/20 bg-[#00C48C]/10 px-3.5 py-1.5 text-xs text-[#00C48C] font-semibold">
          {isQuerying ? 'Thinking...' : 'Concierge Active'}
        </div>
      </div>

      <div className="space-y-4 rounded-[24px] border border-white/10 bg-[#05070B] p-4 max-h-[550px] min-h-[300px] overflow-y-auto flex-1">
        {messages.length === 0 ? (
          <div className="rounded-[20px] border border-white/10 bg-[#0D121F] p-5 text-xs text-slate-400 leading-6">
            <span className="text-[#00C48C] font-bold block mb-2">Welcome to the Business Intelligence Workspace</span>
            Ready to explore? Please select and upload a data signal CSV on the left.
            Once synced, you can query Rabbit to:
            <ul className="mt-2 space-y-1.5 pl-3 list-disc">
              <li>Forecast future demand and run time-series regressions.</li>
              <li>Scan the dataset for outliers, quality indices, or fraud metrics.</li>
              <li>Perform regional comparisons, market shares, and segment declines.</li>
            </ul>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-[20px] border p-4 shadow-sm ${message.role === 'user' ? 'border-[#00C48C]/20 bg-[#00C48C]/10' : 'border-white/10 bg-[#0D121F]'}`}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {message.role === 'user' ? 'You' : 'Rabbit Copilot'}
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-300 font-sans">
                {formatMessageText(message.text)}
              </div>

              {/* Renders KPIs dynamically */}
              {message.kpis && message.kpis.length > 0 && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mt-4">
                  {message.kpis.map((kpi, kIdx) => (
                    <div key={kIdx} className="rounded-xl border border-white/5 bg-[#05070B]/50 p-3 flex flex-col justify-between">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{kpi.label}</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-base font-bold font-mono text-white">{kpi.value}</span>
                        {kpi.change && (
                          <span className={`text-[8px] font-semibold ${
                            kpi.trend === 'up' ? 'text-emerald-400' : kpi.trend === 'down' ? 'text-red-400' : 'text-slate-400'
                          }`}>
                            {kpi.change}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Renders dynamic charts */}
              {message.graph && message.graph.type !== 'none' && (
                <DataVisualizer
                  type={message.graph.type}
                  title={message.graph.title}
                  data={message.graph.data}
                />
              )}

              {/* Renders Next Suggestion Questions */}
              {message.nextQuestions && message.nextQuestions.length > 0 && (
                <div className="mt-4 border-t border-white/5 pt-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Recommended Follow-up Questions</div>
                  <div className="flex flex-wrap gap-1.5">
                    {message.nextQuestions.map((q, qIdx) => (
                      <button
                        key={qIdx}
                        onClick={() => executeQuery(q)}
                        className="px-3 py-1 rounded-full border border-white/10 hover:border-[#00C48C] hover:text-[#00C48C] text-[9px] text-slate-400 bg-white/5 transition cursor-pointer"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {ingestionStage === 'synced' && (
        <form className="mt-2 flex flex-col gap-3" onSubmit={handlePrompt}>
          <textarea
            className="min-h-16 rounded-[20px] border border-white/10 bg-[#05070B] p-4 text-xs text-white outline-none focus:border-[#00C48C]/40 transition w-full resize-none"
            placeholder="Ask Rabbit about trends, correlations, or anomalies..."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isQuerying}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                executeQuery(prompt);
                setPrompt('');
              }
            }}
          />
          <button 
            className="rounded-full bg-[#00C48C] px-5 py-2.5 text-xs font-semibold text-[#03110c] transition hover:bg-[#00A877] cursor-pointer disabled:opacity-50" 
            type="submit"
            disabled={isQuerying || !prompt.trim()}
          >
            {isQuerying ? 'Calculating results...' : 'Ask Rabbit'}
          </button>
        </form>
      )}
    </div>
  </div>)

  const renderProfile = () => {
    const handleSaveProfile = (e: React.FormEvent) => {
      e.preventDefault()
      setUserSession({
        name: editName.trim() || userSession.name,
        role: editRole.trim() || userSession.role,
        company: editCompany.trim() || userSession.company,
        email: userSession.email,
        photoUrl: editPhotoUrl || undefined
      })
      setIsEditingProfile(false)
    }

    return renderPanel('Profile', 'Team member controls and engagement preferences', <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      {isEditingProfile ? (
        <form onSubmit={handleSaveProfile} className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Full Name</label>
            <input 
              className="w-full rounded-xl border border-white/10 bg-[#05070B] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00C48C]/40 transition" 
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Ben stokes"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Workspace Role</label>
            <input 
              className="w-full rounded-xl border border-white/10 bg-[#05070B] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00C48C]/40 transition" 
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              placeholder="Administrator"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Company</label>
            <input 
              className="w-full rounded-xl border border-white/10 bg-[#05070B] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#00C48C]/40 transition" 
              value={editCompany}
              onChange={(e) => setEditCompany(e.target.value)}
              placeholder="One8"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#00C48C] to-[#8B5CF6] text-lg font-semibold text-white overflow-hidden">
                {editPhotoUrl ? (
                  <img src={editPhotoUrl} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  getInitials(editName || 'User')
                )}
              </div>
              <input 
                type="file"
                accept="image/*"
                className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#00C48C]/15 file:text-[#67f0c3] hover:file:bg-[#00C48C]/25 cursor-pointer file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setEditPhotoUrl(reader.result as string)
                    }
                    reader.readAsDataURL(file)
                  }
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button 
              type="button"
              className="flex-1 rounded-full border border-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/5 transition cursor-pointer"
              onClick={() => setIsEditingProfile(false)}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 rounded-full bg-[#00C48C] px-4 py-2.5 text-sm font-semibold text-[#03110c] hover:bg-[#00A877] transition cursor-pointer"
            >
              Save Profile
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#00C48C] to-[#8B5CF6] text-lg font-semibold text-white overflow-hidden">
              {userSession.photoUrl ? (
                <img src={userSession.photoUrl} alt={userSession.name} className="h-full w-full object-cover" />
              ) : (
                getInitials(userSession.name)
              )}
            </div>
            <div>
              <div className="text-xl font-semibold text-white">{userSession.name}</div>
              <div className="text-sm text-slate-400">{userSession.role} • {userSession.company}</div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
              <div className="text-sm text-slate-500">Workspace role</div>
              <div className="mt-2 font-semibold text-white">{userSession.role}</div>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
              <div className="text-sm text-slate-500">Reports shared</div>
              <div className="mt-2 font-semibold text-white">248 this month</div>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 text-slate-300 flex flex-col justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Preferences</h3>
          <p className="mt-3 leading-7">Switch notification cadence, share dashboards, and keep your workflow aligned with executive updates.</p>
        </div>
        <button 
          className="mt-6 w-full rounded-full bg-[#00C48C] px-5 py-3 font-semibold text-[#03110c] hover:bg-[#00A877] transition cursor-pointer"
          onClick={handleStartEditProfile}
          disabled={isEditingProfile}
        >
          Manage profile
        </button>
      </div>
    </div>)
  }

  const renderSettings = () => renderPanel('Configuration', 'System preferences and integration controls', <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 flex flex-col gap-4">
      <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
        <div className="flex items-center justify-between">
          <span className="text-white">Default AI model</span>
          <select 
            className="rounded-xl border border-white/10 bg-[#0D121F] px-3 py-1.5 text-xs text-[#00C48C] outline-none focus:border-[#00C48C]/40 transition cursor-pointer"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
          >
            <option value="Forecast Pro">Forecast Pro</option>
            <option value="Gemini 3.5 Flash">Gemini 3.5 Flash</option>
            <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
            <option value="GPT-4o Mini">GPT-4o Mini</option>
          </select>
        </div>
      </div>
      <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
        <div className="flex items-center justify-between">
          <span className="text-white">Slack integration</span>
          <select 
            className="rounded-xl border border-white/10 bg-[#0D121F] px-3 py-1.5 text-xs text-[#00C48C] outline-none focus:border-[#00C48C]/40 transition cursor-pointer"
            value={slackConnected ? 'Connected' : 'Disconnected'}
            onChange={(e) => setSlackConnected(e.target.value === 'Connected')}
          >
            <option value="Connected">Connected</option>
            <option value="Disconnected">Disconnected</option>
          </select>
        </div>
      </div>
      <div className="rounded-[20px] border border-white/10 bg-[#05070B] p-4">
        <div className="flex items-center justify-between">
          <span className="text-white">Auto-report cadence</span>
          <select 
            className="rounded-xl border border-white/10 bg-[#0D121F] px-3 py-1.5 text-xs text-[#00C48C] outline-none focus:border-[#00C48C]/40 transition cursor-pointer"
            value={reportCadence}
            onChange={(e) => setReportCadence(e.target.value)}
          >
            <option value="Every Monday">Every Monday</option>
            <option value="Every Day">Every Day</option>
            <option value="Every Month">Every Month</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>
      </div>
    </div>
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 text-slate-300 flex flex-col justify-between">
      <div>
        <h3 className="text-xl font-semibold text-white">Operational controls</h3>
        <p className="mt-3 leading-7">Tune retention policy, signal thresholds, and escalation rules for every deployment.</p>
      </div>
      <div className="mt-6">
        <button 
          className="w-full rounded-full bg-[#00C48C] px-5 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877] cursor-pointer" 
          onClick={handleSaveSettings}
        >
          Save changes
        </button>
        {settingsSavedAlert && (
          <div className="mt-4 p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-[#00C48C] text-xs font-semibold text-center transition-all animate-pulse">
            ✓ Configurations saved successfully!
          </div>
        )}
      </div>
    </div>
  </div>)

  const renderPrivacy = () => renderPanel('Privacy', 'Terms and data protection documentation', <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-8 text-slate-300">
    <h3 className="text-xl font-semibold text-white">Data handling</h3>
    <p className="mt-3 leading-8">Talking Rabbitt encrypts all customer data in transit and at rest, provides SOC2-ready audit trails, and enables granular user permissions for regulated industries.</p>
    <p className="mt-4 leading-8">You may export, revoke, or delete your stored activity at any time from your privacy controls panel.</p>
  </div>)

  const renderHelp = () => renderPanel('Help', 'Support and walkthrough modules', <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
      <h3 className="text-xl font-semibold text-white">Common workflows</h3>
      <ul className="mt-4 space-y-3 text-slate-300">
        <li>• Connect a CSV or SQL source</li>
        <li>• Launch forecasting for a KPI</li>
        <li>• Share a narrated insight report</li>
      </ul>
    </div>
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7 text-slate-300">
      <h3 className="text-xl font-semibold text-white">Need more help?</h3>
      <p className="mt-3 leading-7">Our team is available 24/7 through the in-app concierge and follow-up playbooks for onboarding.</p>
      <button 
        className="mt-6 rounded-full bg-[#00C48C] px-6 py-2.5 text-sm font-semibold text-[#03110c] hover:bg-[#00A877] transition cursor-pointer"
        onClick={() => setSupportChatOpen(true)}
      >
        Open support chat
      </button>
    </div>
  </div>)

  const pageContent = () => {
    switch (view) {
      case 'login':
        return renderLogin()
      case 'register':
        return renderRegister()
      case 'dashboard':
        return renderDashboard()
      case 'profile':
        return renderProfile()
      case 'settings':
        return renderSettings()
      case 'privacy':
        return renderPrivacy()
      case 'help':
        return renderHelp()
      default:
        return renderLanding()
    }
  }

  return (
    <>
      {pageContent()}
      
      {/* Support Chat Overlay Widget */}
      {supportChatOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-96 w-80 flex-col rounded-2xl border border-white/15 bg-[#0D121F]/95 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all">
          <div className="flex items-center justify-between rounded-t-2xl border-b border-white/10 bg-[#0E131F] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00C48C] opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#00C48C]"></span>
              </span>
              <span className="text-sm font-semibold text-white">Rabbit Live Concierge</span>
            </div>
            <button 
              className="text-slate-400 hover:text-white transition cursor-pointer text-lg font-bold"
              onClick={() => setSupportChatOpen(false)}
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-none">
            {supportMessages.map((m, idx) => (
              <div key={idx} className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ${
                m.role === 'user' 
                  ? 'ml-auto bg-[#00C48C] text-[#03110c] font-medium animate-fade-in' 
                  : 'bg-white/5 border border-white/5 text-slate-200 animate-fade-in'
              }`}>
                {m.text}
              </div>
            ))}
            {supportAgentTyping && (
              <div className="max-w-[80px] rounded-2xl px-3 py-2 text-xs bg-white/5 border border-white/5 text-slate-400 animate-pulse">
                Typing...
              </div>
            )}
          </div>
          <form 
            onSubmit={async (e) => {
              e.preventDefault()
              if (!supportInput.trim() || supportAgentTyping) return
              const text = supportInput.trim()
              setSupportInput('')
              setSupportMessages(curr => [...curr, { role: 'user', text }])
              setSupportAgentTyping(true)
              
              try {
                let response;
                try {
                  response = await fetch('/api/support-chat', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ prompt: text })
                  });
                } catch (networkError: any) {
                  console.error("[FRONTEND] Network error during support chat:", networkError);
                  throw new Error("Backend server is not reachable.");
                }
                
                const contentType = response.headers.get('content-type');
                const isJson = contentType && contentType.includes('application/json');
                
                if (!response.ok) {
                  throw new Error("AI processing failed.");
                }
                
                if (!isJson) {
                  throw new Error("Invalid response from server.");
                }
                
                const data = await response.json()
                setSupportMessages(curr => [...curr, { role: 'agent', text: data.text }])
              } catch (err: any) {
                console.error("[FRONTEND] Support chat handler failed:", err.message);
                setSupportMessages(curr => [...curr, { 
                  role: 'agent', 
                  text: `⚠️ Error: ${err.message || 'AI processing failed.'}` 
                }])
              } finally {
                setSupportAgentTyping(false)
              }
            }}
            className="p-3 border-t border-white/10 flex gap-2"
          >
            <input 
              className="flex-1 rounded-xl border border-white/10 bg-[#05070B] px-3 py-2 text-xs text-white outline-none focus:border-[#00C48C]/40 transition" 
              placeholder="Type a message..."
              value={supportInput}
              onChange={(e) => setSupportInput(e.target.value)}
              disabled={supportAgentTyping}
            />
            <button 
              className="rounded-xl bg-[#00C48C] px-3 py-2 text-xs font-semibold text-[#03110c] hover:bg-[#00A877] transition cursor-pointer disabled:opacity-50"
              type="submit"
              disabled={supportAgentTyping || !supportInput.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function RabbitIcon({ className = 'h-5 w-5' }: { className?: string; solid?: boolean }) {
  return (
    <img
      src={rabbitIcon}
      alt="Talking Rabbit icon"
      className={`${className} object-contain`}
      style={{ borderRadius: '0.75rem' }}
    />
  )
}

// Old BarChart and LineChart components removed. Dynamic visualizer is used instead.

function formatMessageText(text: string) {
  return text.split('\n').map((line, idx) => {
    let cleanLine = line
    if (line.startsWith('### ')) {
      return <h4 key={idx} className="text-sm font-semibold text-white mt-4 mb-2 first:mt-1">{line.slice(4)}</h4>
    }
    if (line.startsWith('## ')) {
      return <h3 key={idx} className="text-base font-semibold text-white mt-5 mb-3 first:mt-1">{line.slice(3)}</h3>
    }
    if (line.startsWith('- ')) {
      cleanLine = line.slice(2)
      return (
        <ul key={idx} className="list-disc list-inside ml-2 my-1 text-slate-355 text-xs">
          <li>{parseInlineMarkdown(cleanLine)}</li>
        </ul>
      )
    }
    return <p key={idx} className="my-1.5 text-slate-355 text-xs leading-5">{parseInlineMarkdown(cleanLine)}</p>
  })
}

function parseInlineMarkdown(text: string) {
  const parts = []
  let index = 0
  const regex = /(\*\*.*?\*\*|`.*?`)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index
    const matchText = match[0]
    
    if (matchIndex > index) {
      parts.push(text.slice(index, matchIndex))
    }
    
    if (matchText.startsWith('**') && matchText.endsWith('**')) {
      parts.push(<strong key={matchIndex} className="font-semibold text-white">{matchText.slice(2, -2)}</strong>)
    } else if (matchText.startsWith('`') && matchText.endsWith('`')) {
      parts.push(<code key={matchIndex} className="bg-slate-900 border border-white/5 px-1 py-0.5 rounded text-[10px] font-mono text-[#00C48C]">{matchText.slice(1, -1)}</code>)
    }
    
    index = regex.lastIndex
  }
  
  if (index < text.length) {
    parts.push(text.slice(index))
  }
  
  return parts.length > 0 ? parts : text;
}

const features = [
  {
    title: 'Real-time Processing',
    copy: 'Ingest millions of rows from CSV, Excel, or SQL and see insights in seconds, not hours.',
    iconClass: 'bg-[#00C48C]/20',
    icon: '↗',
  },
  {
    title: 'AI Narrative',
    copy: "Don't just look at charts. Get written summaries explaining exactly why your revenue changed.",
    iconClass: 'bg-[#8B5CF6]/20',
    icon: '✦',
  },
  {
    title: 'Predictive Models',
    copy: "Built-in forecasting tools predict next month's sales with up to 94% accuracy using ML.",
    iconClass: 'bg-[#D97706]/20',
    icon: '◌',
  },
  {
    title: 'Natural Language Query',
    copy: "Ask 'Why did sales drop in Ohio?' and get a visual dashboard and explanation instantly.",
    iconClass: 'bg-sky-500/20',
    icon: '⌘',
  },
  {
    title: 'Enterprise Security',
    copy: 'Bank-grade encryption and SOC2 compliance ensure your business data stays private.',
    iconClass: 'bg-teal-500/20',
    icon: '◈',
  },
  {
    title: 'Automated Reports',
    copy: "Schedule PDF reports to your team's Slack or Email every Monday at 8:00 AM.",
    iconClass: 'bg-orange-500/20',
    icon: '✉',
  },
]

const stats = [
  { value: '99.9%', label: 'UPTIME SLA', color: 'text-[#00C48C]' },
  { value: '10x', label: 'FASTER ANALYSIS', color: 'text-[#8B5CF6]' },
  { value: '24/7', label: 'AI SUPPORT', color: 'text-cyan-400' },
  { value: 'Zero', label: 'CODE REQUIRED', color: 'text-[#D97706]' },
]

export default App
