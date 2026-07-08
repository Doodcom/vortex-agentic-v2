import { useState, useEffect, useMemo, useCallback } from 'react'
import { codeToHtml } from 'shiki'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Play, Square, Folder, RefreshCw, CheckCircle2, AlertCircle, Terminal, Layers, Settings, Copy, Check } from 'lucide-react'

interface ServiceConfig {
  name: string
  image: string
  ports: string[]
  env: { key: string; value: string }[]
  volumes: string[]
}

interface Project {
  name: string
  path: string
  status: string
  services: string[]
}

function generateYaml(services: ServiceConfig[]): string {
  let yaml = `version: '3.8'\n\nservices:\n`
  for (const s of services) {
    if (!s.name || !s.image) continue
    yaml += `  ${s.name.trim()}:\n`
    yaml += `    image: ${s.image.trim()}\n`
    
    if (s.ports && s.ports.length > 0) {
      const validPorts = s.ports.filter(p => p.trim())
      if (validPorts.length > 0) {
        yaml += `    ports:\n`
        for (const p of validPorts) {
          yaml += `      - "${p.trim()}"\n`
        }
      }
    }

    const validEnv = s.env.filter(e => e.key.trim())
    if (validEnv.length > 0) {
      yaml += `    environment:\n`
      for (const e of validEnv) {
        yaml += `      - ${e.key.trim()}=${e.value.trim()}\n`
      }
    }

    if (s.volumes && s.volumes.length > 0) {
      const validVols = s.volumes.filter(v => v.trim())
      if (validVols.length > 0) {
        yaml += `    volumes:\n`
        for (const v of validVols) {
          yaml += `      - ${v.trim()}\n`
        }
      }
    }
  }
  return yaml
}

export default function DockerComposeBuilderView() {
  const [activeTab, setActiveTab] = useState<'builder' | 'projects'>('builder')
  const [projectName, setProjectName] = useState('my-compose-project')
  const [services, setServices] = useState<ServiceConfig[]>([
    { name: 'web', image: 'nginx:alpine', ports: ['80:80'], env: [{ key: 'NGINX_PORT', value: '80' }], volumes: [] }
  ])
  
  const [yamlHtml, setYamlHtml] = useState('')
  const [logs, setLogs] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const compiledYaml = useMemo(() => generateYaml(services), [services])

  // Live syntax highlighting for YAML
  useEffect(() => {
    let active = true
    async function highlight() {
      try {
        const html = await codeToHtml(compiledYaml, { lang: 'yaml', theme: 'one-dark-pro' })
        if (active) setYamlHtml(html)
      } catch (err) {
        if (active) setYamlHtml('')
      }
    }
    highlight()
    return () => { active = false }
  }, [compiledYaml])

  // Stream logs
  useEffect(() => {
    if (!(window as any).electron) return
    const unsubscribe = window.electron.on('update-log', (text: string) => {
      setLogs(prev => prev + text + '\n')
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const loadProjects = useCallback(async () => {
    if (!(window as any).electron) return
    setProjectsLoading(true)
    const res = await window.electron.dockerComposeList()
    if (res.success && res.projects) {
      setProjects(res.projects)
    } else {
      showToast(res.error || 'Failed to load projects', false)
    }
    setProjectsLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'projects') {
      loadProjects()
    }
  }, [activeTab, loadProjects])

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updateService = (index: number, updatedFields: Partial<ServiceConfig>) => {
    setServices(prev => prev.map((s, idx) => idx === index ? { ...s, ...updatedFields } : s))
  }

  const addService = () => {
    setServices(prev => [...prev, { name: `service-${prev.length + 1}`, image: '', ports: [], env: [], volumes: [] }])
  }

  const deleteService = (index: number) => {
    setServices(prev => prev.filter((_, idx) => idx !== index))
  }

  // Dynamic arrays helpers
  const addPort = (srvIdx: number) => {
    updateService(srvIdx, { ports: [...services[srvIdx].ports, ''] })
  }
  const updatePort = (srvIdx: number, portIdx: number, val: string) => {
    const newPorts = [...services[srvIdx].ports]
    newPorts[portIdx] = val
    updateService(srvIdx, { ports: newPorts })
  }
  const removePort = (srvIdx: number, portIdx: number) => {
    updateService(srvIdx, { ports: services[srvIdx].ports.filter((_, i) => i !== portIdx) })
  }

  const addEnv = (srvIdx: number) => {
    updateService(srvIdx, { env: [...services[srvIdx].env, { key: '', value: '' }] })
  }
  const updateEnv = (srvIdx: number, envIdx: number, field: 'key' | 'value', val: string) => {
    const newEnv = [...services[srvIdx].env]
    newEnv[envIdx] = { ...newEnv[envIdx], [field]: val }
    updateService(srvIdx, { env: newEnv })
  }
  const removeEnv = (srvIdx: number, envIdx: number) => {
    updateService(srvIdx, { env: services[srvIdx].env.filter((_, i) => i !== envIdx) })
  }

  const addVolume = (srvIdx: number) => {
    updateService(srvIdx, { volumes: [...services[srvIdx].volumes, ''] })
  }
  const updateVolume = (srvIdx: number, volIdx: number, val: string) => {
    const newVols = [...services[srvIdx].volumes]
    newVols[volIdx] = val
    updateService(srvIdx, { volumes: newVols })
  }
  const removeVolume = (srvIdx: number, volIdx: number) => {
    updateService(srvIdx, { volumes: services[srvIdx].volumes.filter((_, i) => i !== volIdx) })
  }

  // Command handlers
  const handleDeploy = async () => {
    const name = projectName.trim()
    if (!name) {
      showToast('Project Name is required', false)
      return
    }
    if (services.filter(s => s.name.trim() && s.image.trim()).length === 0) {
      showToast('At least one configured service is required', false)
      return
    }
    setDeploying(true)
    setLogs(`Starting deployment for project [${name}]...\n`)
    const res = await window.electron.dockerComposeDeploy({ projectName: name, yamlContent: compiledYaml })
    setDeploying(false)
    if (res.success) {
      showToast(`Project [${name}] deployed successfully`, true)
    } else {
      showToast(res.error || `Deployment for [${name}] failed`, false)
    }
  }

  const handleStop = async (projName: string) => {
    setLogs(`Stopping project [${projName}]...\n`)
    const res = await window.electron.dockerComposeDown({ projectName: projName })
    if (res.success) {
      showToast(`Project [${projName}] stopped`, true)
      if (activeTab === 'projects') loadProjects()
    } else {
      showToast(res.error || `Failed to stop [${projName}]`, false)
    }
  }

  const handleDeleteProject = async (projName: string) => {
    if (!confirm(`Are you sure you want to stop and delete project [${projName}] folder?`)) return
    const res = await window.electron.dockerComposeDelete({ projectName: projName })
    if (res.success) {
      showToast(`Project [${projName}] deleted`, true)
      if (activeTab === 'projects') loadProjects()
    } else {
      showToast(res.error || `Failed to delete [${projName}]`, false)
    }
  }

  const handleProjectDeploy = async (projName: string, _path: string) => {
    // Read the yaml content of the project if we want to deploy it again
    setLogs(`Re-deploying project [${projName}]...\n`)
    const res = await window.electron.dockerComposeDeploy({ projectName: projName, yamlContent: '' }) // if yamlContent is empty, backend just runs docker compose up -d in existing directory
    if (res.success) {
      showToast(`Project [${projName}] started`, true)
      if (activeTab === 'projects') loadProjects()
    } else {
      showToast(res.error || `Failed to start [${projName}]`, false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 200, display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontSize: '12px', fontFamily: 'monospace', color: toast.ok ? 'var(--signal)' : 'var(--crimson)' }}
          >
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', marginBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('builder')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: activeTab === 'builder' ? 'var(--crimson)' : 'rgba(255,255,255,0.02)',
            border: activeTab === 'builder' ? 'none' : '1px solid rgba(255,255,255,0.06)',
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '11px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Compose Builder
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: activeTab === 'projects' ? 'var(--crimson)' : 'rgba(255,255,255,0.02)',
            border: activeTab === 'projects' ? 'none' : '1px solid rgba(255,255,255,0.06)',
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '11px',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Active Projects
        </button>
      </div>

      {activeTab === 'builder' ? (
        <>
          {/* Main Workspace grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
            
            {/* Left: Service Editor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="v-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings size={14} style={{ color: 'var(--signal)' }} />
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>Compose Configuration</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Project Name</label>
                  <input
                    value={projectName}
                    onChange={e => setProjectName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="my-compose-project"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
                  />
                  <span style={{ fontSize: '8px', color: '#52525b', fontFamily: 'monospace' }}>Files saved at ~/Vortex-Compose/[projectName]/docker-compose.yml</span>
                </div>
              </div>

              {/* Services List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {services.map((srv, srvIdx) => (
                  <div key={srvIdx} className="v-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
                    <button
                      onClick={() => deleteService(srvIdx)}
                      style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Delete Service"
                    >
                      <Trash2 size={14} className="hover:text-red-500 transition-colors" />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={13} style={{ color: '#a78bfa' }} />
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#c084fc', fontWeight: 'bold' }}>Service #{srvIdx + 1}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Service Name</label>
                        <input
                          value={srv.name}
                          onChange={e => updateService(srvIdx, { name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
                          placeholder="web"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Docker Image</label>
                        <input
                          value={srv.image}
                          onChange={e => updateService(srvIdx, { image: e.target.value })}
                          placeholder="nginx:alpine"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', color: '#f4f4f5', fontSize: '12px', fontFamily: 'monospace', outline: 'none' }}
                        />
                      </div>
                    </div>

                    {/* Ports mapping */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Ports Mappings</label>
                        <button onClick={() => addPort(srvIdx)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Plus size={8} /> Add Port
                        </button>
                      </div>
                      {srv.ports.map((port, pIdx) => (
                        <div key={pIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            value={port}
                            onChange={e => updatePort(srvIdx, pIdx, e.target.value)}
                            placeholder="80:80"
                            style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                          />
                          <button onClick={() => removePort(srvIdx, pIdx)} style={{ background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer' }}>
                            <Trash2 size={11} className="hover:text-red-500 transition-colors" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Env variables */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Environment Variables</label>
                        <button onClick={() => addEnv(srvIdx)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Plus size={8} /> Add Variable
                        </button>
                      </div>
                      {srv.env.map((env, eIdx) => (
                        <div key={eIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            value={env.key}
                            onChange={e => updateEnv(srvIdx, eIdx, 'key', e.target.value)}
                            placeholder="KEY"
                            style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                          />
                          <span style={{ color: '#52525b' }}>=</span>
                          <input
                            value={env.value}
                            onChange={e => updateEnv(srvIdx, eIdx, 'value', e.target.value)}
                            placeholder="value"
                            style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                          />
                          <button onClick={() => removeEnv(srvIdx, eIdx)} style={{ background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer' }}>
                            <Trash2 size={11} className="hover:text-red-500 transition-colors" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Volumes mapping */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '9px', fontFamily: 'monospace', color: '#71717a', textTransform: 'uppercase' }}>Volume Mappings</label>
                        <button onClick={() => addVolume(srvIdx)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Plus size={8} /> Add Volume
                        </button>
                      </div>
                      {srv.volumes.map((vol, vIdx) => (
                        <div key={vIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            value={vol}
                            onChange={e => updateVolume(srvIdx, vIdx, e.target.value)}
                            placeholder="./data:/var/lib/data"
                            style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '6px 10px', color: '#f4f4f5', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
                          />
                          <button onClick={() => removeVolume(srvIdx, vIdx)} style={{ background: 'transparent', border: 'none', color: '#52525b', cursor: 'pointer' }}>
                            <Trash2 size={11} className="hover:text-red-500 transition-colors" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addService}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', color: '#a1a1aa', fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Plus size={12} /> Add Container Service
              </button>
            </div>

            {/* Right Panel: Live YAML Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="v-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Folder size={14} style={{ color: 'var(--signal)' }} />
                    <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>Live YAML Editor</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', color: '#a1a1aa', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copied ? <Check size={10} style={{ color: '#10b981' }} /> : <Copy size={10} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div
                  className="shiki-container"
                  style={{
                    flex: 1,
                    minHeight: '360px',
                    maxHeight: '520px',
                    overflowY: 'auto',
                    background: '#0c0a09',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '8px',
                    padding: '16px',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}
                  dangerouslySetInnerHTML={{ __html: yamlHtml || `<pre style="color: #52525b">${compiledYaml}</pre>` }}
                />

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    onClick={handleDeploy}
                    disabled={deploying}
                    style={{ flex: 1, padding: '10px 16px', borderRadius: '8px', background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--signal)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 'bold' }}
                  >
                    {deploying ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    {deploying ? 'Deploying...' : 'Deploy (Up)'}
                  </button>
                  <button
                    onClick={() => handleStop(projectName)}
                    style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--crimson)', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Square size={12} /> Stop (Down)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom: Terminal Panel */}
          <div className="v-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={12} style={{ color: '#71717a' }} />
                <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>Terminal Logs</span>
              </div>
              <button onClick={() => setLogs('')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', color: '#71717a', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', padding: '3px 8px' }}>Clear</button>
            </div>
            <pre style={{ height: '180px', overflowY: 'auto', background: '#0c0a09', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#d4d4d8', whiteSpace: 'pre-wrap', margin: 0 }}>
              {logs || 'No output logs yet. Deploy a compose setup to see details.'}
            </pre>
          </div>
        </>
      ) : (
        /* Tab 2: Projects List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="v-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Folder size={13} style={{ color: '#52525b' }} />
              <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#a1a1aa', fontWeight: 'bold' }}>Compose Projects</span>
              <button onClick={loadProjects} style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={9} className={projectsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '200px 100px 1fr 220px', gap: '0 12px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#3f3f46' }}>
              <span>Project Name</span><span>Status</span><span>Configured Services</span><span>Actions</span>
            </div>

            {projectsLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>Loading active compose environments...</div>
            ) : projects.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#3f3f46', fontFamily: 'monospace', fontSize: '11px', fontStyle: 'italic' }}>No compose projects found in ~/Vortex-Compose</div>
            ) : projects.map((p, i) => (
              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '200px 100px 1fr 220px', gap: '0 12px', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '11px', fontFamily: 'monospace', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.003)' }}>
                <span style={{ color: 'white', fontWeight: 'bold' }}>{p.name}</span>
                <span style={{ fontSize: '8px', textTransform: 'uppercase', color: p.status === 'running' ? '#10b981' : '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p.status === 'running' ? '#10b981' : '#ef4444' }} />
                  {p.status}
                </span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {p.services.map(s => (
                    <span key={s} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '9px', color: '#a1a1aa' }}>
                      {s}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => handleProjectDeploy(p.name, p.path)}
                    style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--signal)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Play size={9} /> Start (Up)
                  </button>
                  <button
                    onClick={() => handleStop(p.name)}
                    style={{ padding: '3px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: 'var(--crimson)', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <Square size={9} /> Stop (Down)
                  </button>
                  <button
                    onClick={() => handleDeleteProject(p.name)}
                    style={{ padding: '3px 6px', borderRadius: '6px', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: '#52525b', fontSize: '8px', fontFamily: 'monospace', cursor: 'pointer' }}
                    title="Delete Project folder and stop environment"
                  >
                    <Trash2 size={9} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Info logs in projects view too */}
          {logs && (
            <div className="v-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#71717a', fontWeight: 'bold' }}>Action Output</span>
                <button onClick={() => setLogs('')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px', color: '#71717a', fontSize: '9px', fontFamily: 'monospace', cursor: 'pointer', padding: '3px 8px' }}>Clear</button>
              </div>
              <pre style={{ height: '120px', overflowY: 'auto', background: '#0c0a09', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', padding: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#d4d4d8', whiteSpace: 'pre-wrap', margin: 0 }}>
                {logs}
              </pre>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
