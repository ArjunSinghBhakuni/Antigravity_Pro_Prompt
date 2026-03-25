import { useState, useEffect, useRef } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Plus, 
  Trash2, 
  LogOut, 
  Send, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Sparkles, 
  MessageSquare, 
  Clock, 
  User as UserIcon,
  Loader2,
  Settings,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---

interface Chat {
  id: string;
  userPrompt: string;
  proPrompt: string;
  timestamp: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  chats: Chat[];
}

interface User {
  name: string;
  email: string;
  picture: string;
}

// --- Constants ---

const MODEL_NAME = "gemini-3.1-flash-lite-preview";
const PROJECTS_KEY = "promptforge_projects";
const USER_KEY = "promptforge_user";

// --- App Component ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isForging, setIsForging] = useState(false);
  const [isUpdatingSummary, setIsUpdatingSummary] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Initialization ---

  useEffect(() => {
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user", e);
      }
    }

    const storedProjects = localStorage.getItem(PROJECTS_KEY);
    if (storedProjects) {
      try {
        setProjects(JSON.parse(storedProjects));
      } catch (e) {
        console.error("Failed to parse projects", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeProjectId, projects]);

  // --- Auth Handlers ---

  const handleTryNow = () => {
    const guestUser: User = {
      name: "Guest User",
      email: "guest@example.com",
      picture: "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest"
    };
    setUser(guestUser);
    localStorage.setItem(USER_KEY, JSON.stringify(guestUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(USER_KEY);
  };

  // --- Project Handlers ---

  const createProject = (name: string, description: string) => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: "",
      chats: []
    };
    setProjects(prev => [newProject, ...prev]);
    setActiveProjectId(newProject.id);
    setIsNewProjectModalOpen(false);
  };

  const deleteProject = (id: string) => {
    if (confirm("Delete this project and all its prompts?")) {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
      }
    }
  };

  const updateProjectName = (id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, updatedAt: new Date().toISOString() } : p));
  };

  const updateProjectDescription = (id: string, description: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, description, updatedAt: new Date().toISOString() } : p));
  };

  const clearChatHistory = (id: string) => {
    if (confirm("Clear chat history for this project?")) {
      setProjects(prev => prev.map(p => p.id === id ? { ...p, chats: [], updatedAt: new Date().toISOString() } : p));
    }
  };

  // --- AI Handlers ---

  const convertToProPrompt = async () => {
    if (!userInput.trim() || !activeProjectId || isForging) return;

    const currentProjectId = activeProjectId;
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;

    setIsForging(true);
    const rawPrompt = userInput;
    setUserInput("");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const lastChats = project.chats.slice(-3).map(c => `• ${c.userPrompt}`).join("\n");
      
      const systemInstruction = `
You are an expert Antigravity AI IDE prompt engineer. 
Antigravity is an agent-first development platform (fork of VS Code) powered by Gemini.
The agent can: read the codebase, write code, run terminal commands, run tests, use a Browser Subagent to visually verify UI, and self-correct errors in a loop.

Your job is to take a developer's casual, vague, or incomplete prompt and transform it into a production-grade Antigravity pro prompt.

A great Antigravity pro prompt always includes:
1. GOAL — exactly what feature or task to complete
2. CONSTRAINTS — what files not to touch, what patterns to follow, what not to change
3. ACCEPTANCE CRITERIA — how to know the task is complete
4. ARTIFACTS — ask for implementation_plan.md first, task.md during, walkthrough.md after
5. TESTS — unit tests, integration tests, and E2E via Browser Subagent where relevant
6. VERIFICATION — how to verify (terminal commands, browser subagent steps, screenshot)
7. SCOPE CONTROL — "Do not modify unrelated files"

Rules for your output:
- Output ONLY the converted pro prompt. No explanation. No preamble. No markdown headers.
- The prompt must be immediately copy-pasteable into the Antigravity chat
- Use numbered steps for multi-part tasks
- If the user mentions a UI feature, include a Browser Subagent verification step
- If the user mentions backend work, include RBAC check, structured logging, retry logic reminders
- Always end with: "Do not stop until all acceptance criteria are verified."

PROJECT CONTEXT (use this to make the prompt more specific):
${project.summary || "No context available"}

PREVIOUS CHAT HISTORY SUMMARY:
${lastChats || "No previous prompts"}

Now convert this prompt:
${rawPrompt}
      `;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: systemInstruction,
      });

      const proPrompt = response.text || "Failed to generate prompt.";

      const newChat: Chat = {
        id: crypto.randomUUID(),
        userPrompt: rawPrompt,
        proPrompt,
        timestamp: new Date().toISOString()
      };

      setProjects(prev => prev.map(p => {
        if (p.id === currentProjectId) {
          const updatedChats = [...p.chats, newChat];
          return { ...p, chats: updatedChats, updatedAt: new Date().toISOString() };
        }
        return p;
      }));

      // Trigger summary update every 3 chats
      const updatedProject = projects.find(p => p.id === currentProjectId);
      if (updatedProject && (updatedProject.chats.length + 1) % 3 === 0) {
        updateProjectSummary(currentProjectId);
      }

    } catch (error) {
      console.error("AI Error:", error);
      alert("Failed to forge prompt. Check your API key or connection.");
    } finally {
      setIsForging(false);
    }
  };

  const updateProjectSummary = async (id: string) => {
    const project = projects.find(p => p.id === id);
    if (!project || project.chats.length === 0) return;

    setIsUpdatingSummary(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const allPrompts = project.chats.map((c, i) => `${i + 1}. ${c.userPrompt}`).join("\n");
      
      const summaryPrompt = `
You are a technical project memory system.

Based on the following list of developer prompts from a coding session,
write a concise technical context summary (max 150 words) that captures:
- What is being built
- The tech stack or patterns mentioned
- Key decisions or constraints mentioned
- What has already been completed

This summary will be injected into future prompts so the AI has context.
Write it as dense, factual bullet points. No filler words.

Prompts from this session:
${allPrompts}

Existing summary to update (if any):
${project.summary || "None"}
      `;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: summaryPrompt,
      });

      const newSummary = response.text || project.summary;

      setProjects(prev => prev.map(p => p.id === id ? { ...p, summary: newSummary, updatedAt: new Date().toISOString() } : p));
    } catch (error) {
      console.error("Summary AI Error:", error);
    } finally {
      setIsUpdatingSummary(false);
    }
  };

  // --- Helpers ---

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const filteredProjects = projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // --- Render ---

  if (!user) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="text-white w-7 h-7" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">PromptForge</h1>
          </div>
          
          <h2 className="text-2xl font-semibold mb-8 text-text-primary">
            Write Antigravity prompts like a senior engineer
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {[
              { icon: Sparkles, title: "Pro Conversion", desc: "Convert vague prompts into production-grade Antigravity prompts" },
              { icon: MessageSquare, title: "Context Memory", desc: "Auto-builds project context memory so every prompt gets smarter" },
              { icon: Settings, title: "Organized", desc: "Organize prompts by project — never lose a great prompt again" }
            ].map((feature, i) => (
              <div key={i} className="bg-card p-6 rounded-2xl border border-border text-left">
                <feature.icon className="text-primary w-6 h-6 mb-4" />
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-4">
            <button 
              onClick={handleTryNow}
              className="flex items-center gap-3 bg-primary text-white px-10 py-4 rounded-full font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 text-lg"
            >
              Try Now ⚡
            </button>
            
            <div className="flex items-center gap-2 text-text-muted text-xs bg-card/50 px-4 py-2 rounded-lg border border-border">
              <Clock className="w-3 h-3" />
              <span>Privacy Note: We don't save anything in our database. All data is stored in your browser's local storage for personal use only.</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="bg-sidebar border-r border-border flex flex-col relative z-20"
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-primary w-5 h-5" />
            <span className="font-bold text-lg">PromptForge</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <button 
            onClick={() => setIsNewProjectModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="px-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {filteredProjects.map(project => (
            <div 
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${activeProjectId === project.id ? 'bg-card border border-border text-primary' : 'hover:bg-card/50 text-text-muted hover:text-text-primary'}`}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-medium truncate">{project.name}</span>
                <span className="text-[10px] opacity-50">{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {filteredProjects.length === 0 && (
            <div className="text-center py-8 text-text-muted text-sm">
              No projects found
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-sidebar/50">
          <div className="flex items-center gap-3 mb-4">
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{user.name}</span>
              <span className="text-xs text-text-muted truncate">{user.email}</span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-text-muted hover:text-red-500 py-2 rounded-lg text-sm transition-all"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-bg">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-4 left-4 z-10 p-2 bg-card border border-border rounded-lg text-text-muted hover:text-text-primary"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}

        {activeProject ? (
          <>
            {/* Header */}
            <header className="p-6 border-b border-border bg-bg/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <input 
                    type="text" 
                    value={activeProject.name}
                    onChange={(e) => updateProjectName(activeProject.id, e.target.value)}
                    className="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  />
                  <input 
                    type="text" 
                    placeholder="Add a description..."
                    value={activeProject.description}
                    onChange={(e) => updateProjectDescription(activeProject.id, e.target.value)}
                    className="text-sm text-text-muted bg-transparent border-none focus:outline-none focus:ring-0 w-full"
                  />
                </div>
                <button 
                  onClick={() => clearChatHistory(activeProject.id)}
                  className="text-xs text-text-muted hover:text-red-500 transition-all"
                >
                  Clear History
                </button>
              </div>

              {/* Context Summary */}
              <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
                <button 
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                  className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-card transition-all"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Project Context Memory
                    {isUpdatingSummary && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </div>
                  {isSummaryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <AnimatePresence>
                  {isSummaryExpanded && (
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="px-4 pb-4"
                    >
                      <div className="text-sm text-text-muted whitespace-pre-wrap leading-relaxed italic">
                        {activeProject.summary || "No context yet. Start chatting to build project memory."}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={() => updateProjectSummary(activeProject.id)}
                          className="text-[10px] uppercase tracking-wider font-bold text-primary hover:underline"
                        >
                          Refresh Memory
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </header>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {activeProject.chats.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                  <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Ready to forge?</h3>
                  <p className="max-w-xs text-sm">Describe what you want to build and I'll create a production-ready Antigravity prompt.</p>
                </div>
              ) : (
                activeProject.chats.map((chat) => (
                  <div key={chat.id} className="space-y-4">
                    {/* User Prompt */}
                    <div className="flex flex-col items-start max-w-3xl">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-text-muted mb-2 ml-1">Your Prompt</div>
                      <div className="bg-sidebar border border-border p-4 rounded-2xl rounded-tl-none text-sm leading-relaxed">
                        {chat.userPrompt}
                      </div>
                    </div>

                    {/* AI Prompt */}
                    <div className="flex flex-col items-start max-w-3xl ml-auto">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-primary mb-2 mr-1 self-end">Antigravity Pro Prompt ⚡</div>
                      <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl rounded-tr-none text-sm leading-relaxed relative group">
                        <div className="whitespace-pre-wrap">{chat.proPrompt}</div>
                        <div className="mt-4 flex items-center justify-between border-t border-primary/10 pt-4">
                          <div className="flex items-center gap-2 text-[10px] text-primary/60">
                            <Clock className="w-3 h-3" />
                            {new Date(chat.timestamp).toLocaleTimeString()}
                          </div>
                          <button 
                            onClick={() => copyToClipboard(chat.proPrompt, chat.id)}
                            className="flex items-center gap-2 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/90 transition-all"
                          >
                            {copiedId === chat.id ? (
                              <><Check className="w-3 h-3" /> Copied</>
                            ) : (
                              <><Copy className="w-3 h-3" /> Copy ⧉</>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-6 bg-bg border-t border-border">
              <div className="max-w-4xl mx-auto relative">
                <textarea 
                  ref={textareaRef}
                  rows={1}
                  placeholder="Describe what you want to build..."
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      convertToProPrompt();
                    }
                  }}
                  className="w-full bg-card border border-border rounded-2xl px-5 py-4 pr-32 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none min-h-[56px] max-h-48"
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
                <div className="absolute right-3 bottom-3 flex items-center gap-2">
                  <button 
                    onClick={convertToProPrompt}
                    disabled={!userInput.trim() || isForging}
                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20"
                  >
                    {isForging ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Forging...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Forge ⚡</>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-center text-[10px] text-text-muted mt-3 uppercase tracking-widest">
                This will be converted into a production-ready Antigravity prompt
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-20 h-20 bg-card rounded-3xl flex items-center justify-center mb-6 border border-border shadow-2xl">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Welcome to PromptForge</h2>
            <p className="text-text-muted max-w-md mb-8">
              Select a project from the sidebar or create a new one to start building production-grade prompts.
            </p>
            <button 
              onClick={() => setIsNewProjectModalOpen(true)}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
            >
              <Plus className="w-5 h-5" />
              Create Your First Project
            </button>
          </div>
        )}
      </main>

      {/* New Project Modal */}
      <AnimatePresence>
        {isNewProjectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNewProjectModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl p-6"
            >
              <h3 className="text-xl font-bold mb-6">Create New Project</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createProject(formData.get('name') as string, formData.get('description') as string);
              }}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Project Name</label>
                    <input 
                      name="name"
                      required
                      autoFocus
                      placeholder="e.g., E-commerce Dashboard"
                      className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-widest mb-2">Description (Optional)</label>
                    <textarea 
                      name="description"
                      placeholder="What are you building?"
                      className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-24 resize-none"
                    />
                  </div>
                </div>
                <div className="mt-8 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsNewProjectModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-primary text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10"
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
