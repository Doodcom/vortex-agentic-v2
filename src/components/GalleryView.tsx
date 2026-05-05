import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image as ImageIcon, Film, Trash2, Search, Filter, Download, X, Maximize2 } from 'lucide-react'
import { notify } from '../lib/notifications'
import { useTheme } from './ThemeProvider'

interface Asset {
  name: string
  path: string
  type: 'image' | 'video'
  size: number
  mtime: number
  url: string
}

export default function GalleryView() {
  const { playSound } = useTheme()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all')
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  const loadAssets = async () => {
    if (!(window as any).electron) return
    setLoading(true)
    try {
      const list = await (window as any).electron.systemListAssets()
      setAssets(list)
    } catch (e) {
      console.error('Failed to load assets:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [])

  const handleDelete = async (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Permanently delete ${asset.name}?`)) return
    
    try {
      const res = await (window as any).electron.systemDeleteAsset(asset.path)
      if (res.success) {
        notify('Gallery', 'Asset deleted', 'info')
        setAssets(prev => prev.filter(a => a.path !== asset.path))
        if (selectedAsset?.path === asset.path) setSelectedAsset(null)
        playSound('click')
      } else {
        notify('Gallery', res.error || 'Failed to delete asset', 'error')
      }
    } catch (e: any) {
      notify('Gallery', e.message, 'error')
    }
  }

  const filteredAssets = assets.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || a.type === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
      
      {/* Search & Filter Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#52525b' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search assets..."
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px', padding: '10px 12px 10px 36px', color: '#f4f4f5', fontSize: '12px',
              fontFamily: 'monospace', outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)' }}>
          {(['all', 'image', 'video'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); playSound('click'); }}
              style={{
                padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: filter === f ? 'rgba(239,68,68,0.1)' : 'transparent',
                color: filter === f ? 'var(--crimson)' : '#71717a',
                fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em',
                transition: 'all 0.2s'
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => { loadAssets(); playSound('click'); }}
          style={{ padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#71717a', cursor: 'pointer' }}
        >
          <Filter size={14} />
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '40px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', opacity: 0.3, fontFamily: 'monospace', fontSize: '12px' }}>
            Scanning neural storage...
          </div>
        ) : filteredAssets.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', opacity: 0.15, gap: '16px' }}>
            <ImageIcon size={48} />
            <span style={{ fontFamily: 'monospace', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>No Assets Found</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            <AnimatePresence>
              {filteredAssets.map(asset => (
                <AssetCard 
                  key={asset.path} 
                  asset={asset} 
                  onClick={() => setSelectedAsset(asset)}
                  onDelete={(e) => handleDelete(asset, e)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedAsset(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.9)',
              backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px'
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <div style={{ position: 'absolute', top: '-40px', right: '-40px', display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setSelectedAsset(null)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="v-card" style={{ padding: '12px', background: '#0d0e11', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 0 50px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                {selectedAsset.type === 'image' ? (
                  <img 
                    src={selectedAsset.url.replace('vortex-asset://', 'file://')} 
                    style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '4px' }}
                  />
                ) : (
                  <video 
                    src={selectedAsset.url.replace('vortex-asset://', 'file://')} 
                    controls 
                    autoPlay 
                    loop
                    style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '4px' }}
                  />
                )}
                
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', fontFamily: 'monospace' }}>{selectedAsset.name}</div>
                    <div style={{ fontSize: '9px', color: '#52525b', fontFamily: 'monospace', marginTop: '4px' }}>
                      {(selectedAsset.size / 1024 / 1024).toFixed(2)} MB • {new Date(selectedAsset.mtime).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                     <button
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = selectedAsset.url.replace('vortex-asset://', 'file://');
                          a.download = selectedAsset.name;
                          a.click();
                        }}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'monospace' }}
                      >
                        <Download size={14} /> Download
                      </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AssetCard({ asset, onClick, onDelete }: { asset: Asset; onClick: () => void; onDelete: (e: React.MouseEvent) => void }) {
  const [imgError, setImgError] = useState(false)
  const previewUrl = asset.url.replace('vortex-asset://', 'file://')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="v-card group"
      style={{
        padding: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px',
        position: 'relative', overflow: 'hidden'
      }}
    >
      <div style={{ 
        width: '100%', aspectRatio: '1', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', 
        overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {asset.type === 'image' ? (
          !imgError ? (
            <img 
              src={previewUrl} 
              alt={asset.name}
              onError={() => setImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <ImageIcon size={32} style={{ opacity: 0.1 }} />
          )
        ) : (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <video 
              src={previewUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Film size={32} style={{ color: 'white', opacity: 0.5 }} />
            </div>
          </div>
        )}

        {/* Badge */}
        <div style={{ 
          position: 'absolute', top: '8px', left: '8px', padding: '3px 6px', borderRadius: '4px',
          background: asset.type === 'image' ? 'rgba(34,211,238,0.2)' : 'rgba(168,85,247,0.2)',
          border: `1px solid ${asset.type === 'image' ? 'rgba(34,211,238,0.3)' : 'rgba(168,85,247,0.3)'}`,
          color: asset.type === 'image' ? 'var(--signal)' : '#a855f7',
          fontSize: '8px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em'
        }}>
          {asset.type}
        </div>

        {/* Hover Overlay */}
        <div className="opacity-0 group-hover:opacity-100" style={{ 
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', transition: 'opacity 0.2s'
        }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Maximize2 size={16} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: '#f4f4f5', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.name}
          </div>
          <div style={{ fontSize: '8px', color: '#52525b', fontFamily: 'monospace', marginTop: '2px' }}>
            {new Date(asset.mtime).toLocaleDateString()}
          </div>
        </div>
        <button
          onClick={onDelete}
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer', color: '#3f3f46', 
            padding: '4px', borderRadius: '6px', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--crimson)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3f3f46'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  )
}
