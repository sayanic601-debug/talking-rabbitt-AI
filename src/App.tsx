import { useEffect, useState, useRef, type FormEvent } from 'react'
import rabbitIcon from '../talking-rabbit-icon.jpeg'

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
  graph?: 'bar' | 'line' | 'none'
  chartData?: Array<{ label: string; value: number; forecast?: boolean }>
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
    
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to upload CSV file.')
      }
      
      const data = await response.json()
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

  const handlePrompt = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim() || isQuerying) return
    const text = prompt.trim()
    setPrompt('')
    
    setMessages((current) => [
      ...current,
      { role: 'user', text }
    ])
    
    setIsQuerying(true)
    
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: text })
      })
      
      if (!response.ok) {
        throw new Error('Server error occurred.')
      }
      
      const data = await response.json()
      
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: data.text,
          graph: data.graph,
          chartData: data.chartData
        }
      ])
    } catch (err: any) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: `⚠️ Failed to get a response from Rabbit: ${err.message || 'Server error.'}`
        }
      ])
    } finally {
      setIsQuerying(false)
    }
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

  const renderDashboard = () => renderPanel('Command Center', 'Agentic AI workflow for your latest data signal', <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-500">Live ingestion</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Revenue pulse</h3>
        </div>
      </div>

      <button 
        className="mt-8 flex w-full flex-col items-center justify-center rounded-[24px] border border-dashed border-[#00C48C]/40 bg-[#05070B]/70 px-6 py-10 text-center transition hover:border-[#00C48C] cursor-pointer" 
        onClick={() => fileInputRef.current?.click()}
        disabled={ingestionStage === 'ingesting' || ingestionStage === 'schema'}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00C48C] text-2xl text-[#03110c]">
          {ingestionStage === 'ingesting' || ingestionStage === 'schema' ? '⏳' : '⬆'}
        </div>
        <div className="mt-4 text-lg font-semibold text-white">
          {datasetInfo ? datasetInfo.filename : 'Upload CSV file'}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          {ingestionStage === 'ingesting' ? 'Uploading file to backend...' : 
           ingestionStage === 'schema' ? 'Analyzing schema and statistics...' :
           ingestionStage === 'synced' ? 'Dataset synced. Click to re-upload another file.' :
           'Click to select and upload a CSV file'}
        </div>
      </button>
      <input 
        type="file" 
        ref={fileInputRef} 
        accept=".csv" 
        className="hidden" 
        onChange={handleFileChange} 
      />

      <div className="mt-6 rounded-[20px] border border-white/10 bg-[#05070B] p-5">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Stage</span>
          <span>{ingestionStage === 'idle' ? 'Waiting' : ingestionStage === 'ingesting' ? 'Ingesting' : ingestionStage === 'schema' ? 'Processing Schema' : 'Synced'}</span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-800">
          <div className={`h-2 rounded-full bg-gradient-to-r from-[#00C48C] to-[#8B5CF6] transition-all ${ingestionStage === 'idle' ? 'w-0' : ingestionStage === 'ingesting' ? 'w-1/3' : ingestionStage === 'schema' ? 'w-2/3' : 'w-full'}`} />
        </div>
      </div>

      {errorAlert && (
        <div className="mt-4 p-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs leading-5">
          {errorAlert}
        </div>
      )}

      {datasetInfo && (
        <div className="mt-6 rounded-[20px] border border-white/10 bg-[#05070B] p-5 text-sm">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-4">Dataset Schema</div>
          <div className="flex justify-between mb-2">
            <span className="text-slate-400">File:</span>
            <span className="text-white font-medium truncate max-w-[180px]" title={datasetInfo.filename}>{datasetInfo.filename}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span className="text-slate-400">Rows:</span>
            <span className="text-white font-medium">{datasetInfo.rowCount}</span>
          </div>
          <div className="border-t border-white/5 my-3 pt-3">
            <span className="text-slate-400 block mb-2">Columns:</span>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {datasetInfo.columns.map((c: any) => (
                <span key={c.name} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-white/5 flex items-center gap-1">
                  {c.name}
                  <span className={`text-[8px] px-1 rounded-sm ${
                    c.type === 'temporal' ? 'bg-amber-500/20 text-amber-300' :
                    c.type === 'numeric' ? 'bg-emerald-500/20 text-emerald-300' :
                    c.type === 'categorical' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-700/20 text-slate-400'
                  }`}>
                    {c.type}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>

    <div className="rounded-[24px] border border-white/10 bg-[#0E131F] p-7">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.3em] text-slate-500">AI copilot</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">Ask anything</h3>
        </div>
        <div className="rounded-full border border-[#00C48C]/20 bg-[#00C48C]/10 px-3 py-2 text-sm text-[#67f0c3]">
          {isQuerying ? 'Thinking...' : 'Ready'}
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-[24px] border border-white/10 bg-[#05070B] p-4 max-h-[450px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="rounded-[20px] border border-white/10 bg-[#0D121F] p-4 text-sm text-slate-400">
            Upload a CSV file first. Once synced, you can ask why sales dropped or request forecast trends to render dynamic insight panels.
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-[20px] border p-4 ${message.role === 'user' ? 'border-[#00C48C]/20 bg-[#00C48C]/10' : 'border-white/10 bg-[#0D121F]'}`}>
              <div className="text-sm font-medium text-white mb-2">{message.role === 'user' ? 'You' : 'Rabbit'}</div>
              <div className="mt-2 text-sm leading-7 text-slate-350">{formatMessageText(message.text)}</div>
              {message.graph === 'bar' && <BarChart data={message.chartData} />}
              {message.graph === 'line' && <LineChart data={message.chartData} />}
            </div>
          ))
        )}
      </div>

      {ingestionStage === 'synced' && (
        <form className="mt-5 flex flex-col gap-3" onSubmit={handlePrompt}>
          <textarea
            className="min-h-24 rounded-[20px] border border-white/10 bg-[#05070B] p-4 text-sm text-white outline-none focus:border-[#00C48C]/40 transition"
            placeholder="Ask why sales dropped, or run a sales forecast..."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isQuerying}
          />
          <button 
            className="rounded-full bg-[#00C48C] px-5 py-3 font-semibold text-[#03110c] transition hover:bg-[#00A877] cursor-pointer disabled:opacity-50" 
            type="submit"
            disabled={isQuerying || !prompt.trim()}
          >
            {isQuerying ? 'Analyzing dataset...' : 'Send to Rabbit'}
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
                const response = await fetch('/api/support-chat', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ prompt: text })
                })
                
                if (!response.ok) {
                  const errData = await response.json().catch(() => ({}))
                  throw new Error(errData.detail || 'Server response error.')
                }
                
                const data = await response.json()
                setSupportMessages(curr => [...curr, { role: 'agent', text: data.text }])
              } catch (err: any) {
                setSupportMessages(curr => [...curr, { 
                  role: 'agent', 
                  text: `⚠️ Error: ${err.message || 'Could not communicate with chatbot.'}` 
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

function BarChart({ data }: { data?: Array<{ label: string; value: number }> }) {
  if (!data || data.length === 0) return null
  const maxVal = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="mt-4 rounded-[20px] border border-white/10 bg-[#0D121F] p-5">
      <div className="flex items-end gap-3 h-36 pt-4">
        {data.map((item, index) => {
          const heightPercent = (item.value / maxVal) * 100
          return (
            <div key={item.label + index} className="flex flex-1 flex-col items-center gap-1.5 h-full justify-end group relative">
              <div className="absolute -top-7 bg-slate-950 border border-white/10 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                {item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
              <div 
                className="w-full rounded-t bg-gradient-to-t from-[#00C48C] to-[#8B5CF6] transition-all duration-300 hover:brightness-110 cursor-pointer" 
                style={{ height: `${Math.max(heightPercent, 4)}%` }} 
              />
              <span className="text-[9px] uppercase tracking-wider text-slate-500 truncate w-full text-center" title={item.label}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineChart({ data }: { data?: Array<{ label: string; value: number; forecast?: boolean }> }) {
  if (!data || data.length === 0) return null
  
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const minVal = 0
  
  const width = 500
  const height = 180
  const padding = { top: 15, right: 25, bottom: 25, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  const points = data.map((item, index) => {
    const x = padding.left + (data.length > 1 ? (index / (data.length - 1)) * chartWidth : 0)
    const y = padding.top + chartHeight - ((item.value - minVal) / (maxVal - minVal || 1)) * chartHeight
    return { x, y, ...item }
  })
  
  const forecastStartIndex = points.findIndex(p => p.forecast)
  
  let histPath = ''
  let forePath = ''
  
  if (forecastStartIndex === -1) {
    histPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  } else {
    const histPoints = points.slice(0, forecastStartIndex + 1)
    const forePoints = points.slice(forecastStartIndex)
    histPath = histPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    forePath = forePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }
  
  const yTicks = [0, maxVal / 2, maxVal]
  
  return (
    <div className="mt-4 rounded-[20px] border border-white/10 bg-[#0D121F] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full overflow-visible">
        {yTicks.map((tick, i) => {
          const y = padding.top + chartHeight - ((tick - minVal) / (maxVal - minVal || 1)) * chartHeight
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">
                {Math.round(tick).toLocaleString()}
              </text>
            </g>
          )
        })}
        
        {points.map((p, i) => {
          if (points.length > 5 && i % 2 !== 0 && i !== points.length - 1) return null
          return (
            <text key={i} x={p.x} y={height - padding.bottom + 14} fill="#64748b" fontSize="8" textAnchor="middle">
              {p.label.replace(' (Forecast)', '')}
            </text>
          )
        })}
        
        {histPath && (
          <path d={histPath} fill="none" stroke="#00C48C" strokeWidth="2.5" strokeLinecap="round" />
        )}
        {forePath && (
          <path d={forePath} fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
        )}
        
        {points.map((p, i) => (
          <g key={i} className="group cursor-pointer">
            <circle cx={p.x} cy={p.y} r={p.forecast ? "3.5" : "4.5"} fill={p.forecast ? "#8B5CF6" : "#00C48C"} stroke="#0D121F" strokeWidth="1.5" />
            <circle cx={p.x} cy={p.y} r="10" fill="transparent" />
            <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-20">
              <rect x={p.x - 40} y={p.y - 26} width="80" height="18" rx="3" fill="#020617" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <text x={p.x} y={p.y - 14} fill="white" fontSize="9" fontWeight="bold" textAnchor="middle">
                {p.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </text>
            </g>
          </g>
        ))}
      </svg>
    </div>
  )
}

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
