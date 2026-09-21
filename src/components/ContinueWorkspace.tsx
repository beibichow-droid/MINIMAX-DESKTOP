import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CircleStop, Copy, Film, GitBranch, LoaderCircle, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { createId } from '../lib/createId'
import { continuationBeatSignature, continuationOutputName, continuationTiming } from '../lib/continuation'
import type { LivePreview } from '../lib/useLivePreview'
import type { GenerationJob, MediaFile } from '../types'
import './continue-workspace.css'

export type ContinueMethod = 'motion' | 'last' | 'frame'
export type ContinueMode = 'text' | 'reference'
export type ContinueBeat = {
  id: string
  name: string
  prompt: string
  duration: number
  frameTime: number
  contextFrames: number
  blendFrames: number
  carryAudio: boolean
  dialogueMode?: 'inherit' | 'none' | 'allow'
  cameraOverride: string
  continuityBreak: boolean
  replacements: Partial<Record<'character' | 'wardrobe' | 'location' | 'prop', MediaFile>>
  replacementOwnerIds?: Partial<Record<'character' | 'wardrobe', string>>
  sourceMode?: 'previous' | 'original' | 'beat'
  sourceBeatId?: string
}
export type ContinueScript = { version: 1; id: string; videoName: string; mode: ContinueMode; method: ContinueMethod; sourceJobId?: string; externalSource?: MediaFile; beats: ContinueBeat[] }

const storageKey = 'oyama.continue.script.v1'
const newBeat = (name = 'Beat 1'): ContinueBeat => ({ id: createId(), name, prompt: '', duration: 5, frameTime: 0, contextFrames: 22, blendFrames: 0, carryAudio: true, dialogueMode: 'inherit', cameraOverride: '', continuityBreak: false, replacements: {}, sourceMode: 'previous' })
const emptyScript = (): ContinueScript => ({ version: 1, id: createId(), videoName: '', mode: 'text', method: 'last', beats: [newBeat()] })
function loadScript(): ContinueScript {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null') as (Omit<ContinueScript, 'beats'> & { beats: Array<ContinueBeat & { branchFromBeatId?: string }> }) | null
    if (raw?.version === 1 && Array.isArray(raw.beats)) return { ...raw, videoName: raw.videoName ?? '', beats: raw.beats.length ? raw.beats.map((beat, index) => ({ ...beat, name: beat.name?.trim() || `Beat ${index + 1}`, dialogueMode: beat.dialogueMode ?? 'inherit', sourceMode: beat.sourceMode ?? (beat.branchFromBeatId ? 'beat' : 'previous'), sourceBeatId: beat.sourceBeatId ?? beat.branchFromBeatId })) : [newBeat()] }
  } catch { /* A damaged draft should not block the workspace. */ }
  return emptyScript()
}

function nextBeatName(beats: ContinueBeat[]) {
  let number = 1
  const names = new Set(beats.map(beat => beat.name.trim().toLocaleLowerCase()))
  while (names.has(`beat ${number}`)) number += 1
  return `Beat ${number}`
}

function sourceName(file: GenerationJob | MediaFile | undefined) {
  if (!file) return ''
  const raw = 'status' in file ? file.localOutputPath?.split(/[\\/]/).at(-1) : file.name
  return raw?.replace(/\.[^.]+$/, '') ?? ''
}

function sourceBeatIdFor(beats: ContinueBeat[], beat: ContinueBeat, index: number) {
  if (beat.sourceMode === 'original') return undefined
  if (beat.sourceMode === 'beat') return beat.sourceBeatId
  return beats[index - 1]?.id
}

function normalizeBeatSources(beats: ContinueBeat[]) {
  return beats.map((beat, index) => beat.sourceMode === 'beat' && (!beat.sourceBeatId || beats.findIndex(item => item.id === beat.sourceBeatId) >= index) ? { ...beat, sourceMode: 'previous' as const, sourceBeatId: undefined } : beat)
}

function ContinuationRenderPreview({ job, livePreview, compact = false }: { job: GenerationJob; livePreview: LivePreview | null; compact?: boolean }) {
  const live = ['queued', 'running'].includes(job.status) && job.promptId && livePreview?.promptId === job.promptId ? livePreview : null
  return <div className={`continue-render-preview ${compact ? 'compact' : ''}`}>
    {live ? <figure><div>{live.mime === 'video/mp4' ? <video key={live.url} src={live.url} aria-label="Animated continuation preview" autoPlay loop muted playsInline preload="auto" /> : <img key={live.url} src={live.url} alt={live.animated ? 'Animated continuation preview' : 'Live continuation preview'} />}</div><figcaption><span><i />Live preview</span><small>{live.animated ? `Animated H3${live.step && live.totalSteps ? ` · step ${live.step}/${live.totalSteps}` : ''}` : 'Intermediate decoded frame'}</small></figcaption></figure> : job.outputUrl ? <video src={job.outputUrl} controls preload="metadata" /> : <div className={`continue-render-placeholder ${job.status}`}><span>{['queued', 'running'].includes(job.status) ? <LoaderCircle className="spin" size={28} /> : <Film size={28} />}</span><strong>{job.status === 'queued' ? 'Waiting for ComfyUI' : job.status === 'running' ? 'Rendering the next beat' : job.status === 'cancelled' ? 'Beat cancelled' : 'Preview unavailable'}</strong><small>{job.progressLabel ?? `${job.width} × ${job.height} · ${job.duration}s`}</small></div>}
    {['queued', 'running'].includes(job.status) && <div className="continue-render-progress"><span><i style={{ width: `${Math.max(2, job.progress)}%` }} /></span><small>{job.currentStep !== undefined && job.totalSteps ? `Step ${job.currentStep} of ${job.totalSteps}` : job.progressLabel ?? 'Preparing preview'}<b>{Math.round(job.progress)}%</b></small></div>}
  </div>
}

export function ContinueWorkspace({ jobs, motionReady, assemblyReady, initialSourceId, livePreview, cancellingIds, onChooseVideo, onChooseImage, onGenerate, onCancel, onResetSource }: {
  jobs: GenerationJob[]
  motionReady: boolean
  assemblyReady: boolean
  initialSourceId: string | null
  livePreview: LivePreview | null
  cancellingIds: Set<string>
  onChooseVideo(): Promise<MediaFile | null>
  onChooseImage(): Promise<MediaFile | null>
  onGenerate(script: ContinueScript, beat: ContinueBeat, source: GenerationJob | MediaFile, method: ContinueMethod): Promise<void>
  onCancel(job: GenerationJob): Promise<void>
  onResetSource(): void
}) {
  const [script, setScript] = useState<ContinueScript>(loadScript)
  const [modalOpen, setModalOpen] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [frameDuration, setFrameDuration] = useState(0)
  const [beatFrameDurations, setBeatFrameDurations] = useState<Record<string, number>>({})
  const modalRef = useRef<HTMLElement>(null)
  const appliedSourceId = useRef<string | null>(null)
  const launched = useRef(new Set<string>())
  const completedJobs = useMemo(() => jobs.filter(job => job.provider === 'minimax' && job.mediaType !== 'image' && job.status === 'completed' && job.outputUrl), [jobs])
  const sourceJob = completedJobs.find(job => job.id === script.sourceJobId)
  const source = sourceJob ?? script.externalSource
  const sourceUrl = sourceJob?.outputUrl ?? script.externalSource?.preview
  const motionAvailable = motionReady && Boolean(sourceJob?.latentFile || jobs.some(job => job.continuation?.scriptId === script.id && job.status === 'completed' && job.latentFile))
  const method: ContinueMethod = script.method === 'motion' && !motionAvailable ? 'last' : script.method
  const beatJobs = useMemo(() => {
    const found = new Map<string, GenerationJob | undefined>()
    script.beats.forEach((beat, index) => {
      const parentId = sourceBeatIdFor(script.beats, beat, index)
      const parentSource = parentId ? found.get(parentId) : source
      const parentJobId = parentId && parentSource && 'status' in parentSource ? parentSource.id : parentId ? undefined : script.sourceJobId ?? script.externalSource?.path
      const beatMethod = method === 'motion' && (!parentSource || !('status' in parentSource) || !parentSource.latentFile) ? 'last' : method
      found.set(beat.id, parentId && !parentJobId ? undefined : jobs.find(job => job.continuation?.scriptId === script.id && job.continuation.beatId === beat.id && job.continuation.sourceJobId === parentJobId && job.continuation.beatSignature === continuationBeatSignature(beat, script.videoName, `${script.mode}:${beatMethod}`)))
    })
    return found
  }, [jobs, method, script, source])
  const continuationJobs = jobs.filter(job => job.continuation?.scriptId === script.id && script.beats.some(beat => beat.id === job.continuation?.beatId))
  const activeBeatJob = continuationJobs.find(job => ['queued', 'running'].includes(job.status))
  const displayedBeatJob = activeBeatJob ?? continuationJobs.find(job => job.outputUrl || job.status === 'failed' || job.status === 'cancelled')
  const displayedBeatNumber = displayedBeatJob ? script.beats.findIndex(beat => beat.id === displayedBeatJob.continuation?.beatId) + 1 : 0

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(script)) }, [script])
  useEffect(() => {
    if (!initialSourceId || appliedSourceId.current === initialSourceId) return
    appliedSourceId.current = initialSourceId
    setScript(current => current.sourceJobId === initialSourceId ? current : { ...current, videoName: current.videoName.trim() || sourceName(jobs.find(job => job.id === initialSourceId)), sourceJobId: initialSourceId, externalSource: undefined, method: motionReady ? 'motion' : 'last' })
  }, [initialSourceId, jobs, motionReady])
  useEffect(() => {
    if (!modalOpen) return
    modalRef.current?.querySelector<HTMLElement>('textarea,button')?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setModalOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const updateBeat = (id: string, patch: Partial<ContinueBeat>) => setScript(current => ({ ...current, beats: current.beats.map(beat => beat.id === id ? { ...beat, ...patch } : beat) }))
  const sourceFor = useCallback((beat: ContinueBeat): GenerationJob | MediaFile | undefined => {
    const index = script.beats.findIndex(item => item.id === beat.id)
    const parentId = sourceBeatIdFor(script.beats, beat, index)
    if (parentId) return beatJobs.get(parentId)?.status === 'completed' ? beatJobs.get(parentId) : undefined
    return source
  }, [script.beats, beatJobs, source])
  const launch = useCallback(async (beat: ContinueBeat) => {
    const prior = sourceFor(beat)
    if (!prior) { setError('Generate the previous beat first, or choose a completed source clip.'); setRunningAll(false); return }
    if (!script.videoName.trim()) { setError('Name the source video before generating a beat.'); setRunningAll(false); return }
    if (!beat.name.trim()) { setError('Give this beat a name before generating it.'); setRunningAll(false); return }
    if (script.beats.some(item => item.id !== beat.id && item.name.trim().toLocaleLowerCase() === beat.name.trim().toLocaleLowerCase())) { setError('Every beat name must be unique. Rename this beat before generating it.'); setRunningAll(false); return }
    if (!beat.prompt.trim()) { setError('Write what happens next for this beat.'); setRunningAll(false); return }
    const sourceCharacters = 'status' in prior ? prior.continuityState?.characters ?? [] : []
    const ambiguousReplacement = (['character', 'wardrobe'] as const).find(role => beat.replacements[role] && sourceCharacters.length > 1 && !beat.replacementOwnerIds?.[role])
    if (ambiguousReplacement) { setError(`Choose which character receives the ${ambiguousReplacement} replacement.`); setRunningAll(false); return }
    if (preparing || ['queued', 'running'].includes(beatJobs.get(beat.id)?.status ?? '')) return
    const beatMethod: ContinueMethod = method === 'motion' && (!('status' in prior) || !prior.latentFile) ? 'last' : method
    setPreparing(beat.id); setError('')
    try {
      await onGenerate(script, beat, prior, beatMethod)
      launched.current.add(beat.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setRunningAll(false)
    } finally { setPreparing(null) }
  }, [sourceFor, preparing, beatJobs, onGenerate, script, method])
  const cancel = useCallback(async (job: GenerationJob) => {
    setRunningAll(false)
    await onCancel(job)
  }, [onCancel])
  useEffect(() => {
    if (!runningAll || preparing) return
    const next = script.beats.find(beat => (!beatJobs.get(beat.id) || ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? '')) && !launched.current.has(beat.id))
    if (!next) {
      const stopped = script.beats.find(beat => ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? ''))
      if (stopped) { setRunningAll(false); setError(`${stopped.name} did not finish. Fix the issue, then choose Generate All to retry from that beat.`) }
      else if (script.beats.every(beat => beatJobs.get(beat.id)?.status === 'completed')) setRunningAll(false)
      return
    }
    const index = script.beats.indexOf(next)
    const parentId = sourceBeatIdFor(script.beats, next, index)
    const parent = parentId ? beatJobs.get(parentId) : null
    if (parent?.status === 'failed' || parent?.status === 'cancelled') { setRunningAll(false); setError('A prior beat did not finish. Regenerate it, then resume Generate All.'); return }
    if (!parentId || parent?.status === 'completed') void launch(next)
  }, [runningAll, jobs, preparing, script, beatJobs, launch])

  const pickExternal = async () => {
    const file = await onChooseVideo()
    if (file) setScript(current => ({ ...current, videoName: current.videoName.trim() || sourceName(file), sourceJobId: undefined, externalSource: file, method: motionReady ? 'motion' : 'last' }))
  }
  const chooseReplacement = async (beat: ContinueBeat, role: keyof ContinueBeat['replacements']) => {
    const file = await onChooseImage()
    if (file) updateBeat(beat.id, { replacements: { ...beat.replacements, [role]: { ...file, referenceRole: role === 'character' ? 'subject' : role } } })
  }
  const insert = (index: number, sourceBeatId?: string) => setScript(current => { const beats = [...current.beats]; beats.splice(index + 1, 0, { ...newBeat(nextBeatName(current.beats)), sourceMode: sourceBeatId ? 'beat' : 'previous', sourceBeatId }); return { ...current, beats } })
  const move = (index: number, direction: -1 | 1) => setScript(current => { const beats = [...current.beats]; const target = index + direction; if (target < 0 || target >= beats.length) return current; [beats[index], beats[target]] = [beats[target], beats[index]]; return { ...current, beats: normalizeBeatSources(beats) } })
  const resetContinuation = () => {
    if (activeBeatJob) return
    if (!window.confirm('Reset the Continuation workspace? This clears the selected source and beat plan. Existing rendered files and generation history will be kept.')) return
    launched.current.clear()
    setRunningAll(false)
    setPreparing(null)
    setError('')
    setFrameDuration(0)
    setBeatFrameDurations({})
    setModalOpen(false)
    onResetSource()
    setScript(emptyScript())
  }

  return <div className="continue-workspace">
    <header className="continue-heading"><div><p className="eyebrow">MINIMAX H3</p><h1>Continue</h1><p>Write the next part of the same scene. Each completed beat becomes the source for the next.</p></div><button className="secondary-button" type="button" disabled={Boolean(activeBeatJob)} title={activeBeatJob ? 'Cancel the active beat before resetting.' : 'Clear the continuation source and beat plan'} onClick={resetContinuation}><RotateCcw size={15} />Reset continuation</button></header>
    <section className="continue-card" aria-label="Continuation source and mode">
      <div className="continue-mode" role="group" aria-label="Continuation mode"><button className={script.mode === 'text' ? 'selected' : ''} onClick={() => setScript(current => ({ ...current, mode: 'text' }))}>T2V Continue</button><button className={script.mode === 'reference' ? 'selected' : ''} onClick={() => setScript(current => ({ ...current, mode: 'reference' }))}>Ref / Ref2VA Continue</button></div>
      <label className="continue-source-label">Finished source clip<select value={script.sourceJobId ?? ''} onChange={event => { const selected = jobs.find(job => job.id === event.target.value); setScript(current => ({ ...current, videoName: current.videoName.trim() || (selected ? sourceName(selected) : ''), sourceJobId: event.target.value || undefined, externalSource: undefined, method: motionReady ? 'motion' : 'last' })) }}><option value="">{script.externalSource ? script.externalSource.name : 'Choose a completed H3 render'}</option>{completedJobs.map(job => <option value={job.id} key={job.id}>{new Date(job.createdAt).toLocaleString()} · {job.prompt.slice(0, 68)}</option>)}</select></label>
      <label className="continue-source-label">Video name<input value={script.videoName} maxLength={64} placeholder="Name this video" onChange={event => setScript(current => ({ ...current, videoName: event.target.value }))} /><small>Used at the start of every continuation output filename.</small></label>
      <button className="secondary-button" onClick={() => void pickExternal()}><Film size={15} />Import a video</button>
      {sourceUrl ? <video className="continue-preview" src={sourceUrl} controls preload="metadata" onLoadedMetadata={event => setFrameDuration(event.currentTarget.duration || 0)} /> : <div className="continue-empty"><Film size={26} /><span>Choose a finished clip to load its continuity.</span></div>}
      <div className="continue-method" role="group" aria-label="Continuation method">{([['motion', 'Motion Context'], ['last', 'Last Frame'], ['frame', 'Choose Frame']] as const).map(([key, label]) => <button key={key} className={script.method === key ? 'selected' : ''} disabled={key === 'motion' && !motionReady} onClick={() => setScript(current => ({ ...current, method: key }))}>{label}</button>)}</div>
      <p className="continue-note" role="status" aria-live="polite">{!assemblyReady ? 'Combined continuation outputs require the MiniMax H3 Extender Trim and Merge nodes.' : motionAvailable ? 'Motion Context can reuse this render’s saved video and audio latents.' : motionReady && script.method === 'motion' ? 'This source has no saved AV latent, so its first beat will use Last Frame. Later beats will switch to Motion Context automatically.' : motionReady ? 'This source predates AV latent capture. Last Frame or Choose Frame will create a compatible latent for later beats.' : 'Last Frame and Choose Frame are ready. Motion Context also requires the Extender Save/Load AV Latent and Video Extender nodes.'}</p>
      <section className={`continue-live-monitor ${activeBeatJob ? 'active' : ''}`} aria-label="Continuation render monitor"><header><span><small>{activeBeatJob ? 'LIVE BEAT MONITOR' : 'BEAT PREVIEW'}</small><strong>{displayedBeatJob ? `Beat ${displayedBeatNumber} · ${displayedBeatJob.status === 'running' ? 'Rendering now' : displayedBeatJob.status}` : 'Ready for the next beat'}</strong></span>{activeBeatJob && <button className="danger-button" disabled={cancellingIds.has(activeBeatJob.id)} onClick={() => void cancel(activeBeatJob)}><CircleStop size={15} />{cancellingIds.has(activeBeatJob.id) ? 'Stopping…' : 'Cancel beat'}</button>}</header>{displayedBeatJob ? <ContinuationRenderPreview job={displayedBeatJob} livePreview={livePreview} /> : <div className="continue-monitor-empty"><Film size={28} /><span>Start a beat to see sampler previews and render progress here.</span></div>}</section>
      <div className="continue-summary"><strong>Continuity</strong><span>{sourceJob ? `${sourceJob.renderWidth ?? sourceJob.width} × ${sourceJob.renderHeight ?? sourceJob.height} · seed ${sourceJob.seed ?? 'new'} · ${sourceJob.latentFile ? 'AV latent saved' : 'frame continuity'}` : script.externalSource ? 'Imported video · frame continuity' : 'Select a source'}</span><span>Camera, appearance, action, and prompt context carry into each beat.</span></div>
      {script.mode === 'reference' && <div className="continue-summary"><strong>References</strong><span>Inherited from the current Ref workspace. Replace character, wardrobe, location, or prop per beat in the script.</span></div>}
      <div className="continue-script-summary"><span><strong>Continuation Script</strong><small>{script.beats.length} planned {script.beats.length === 1 ? 'beat' : 'beats'} · {script.beats.filter(beat => beatJobs.get(beat.id)?.status === 'completed').length} complete</small></span><button className="primary-button" onClick={() => setModalOpen(true)}>Open Continuation Script</button></div>
    </section>
    {modalOpen && <div className="continue-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModalOpen(false) }}><section className="continue-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="continue-script-title"><header><span><strong id="continue-script-title">Continuation Script</strong><small>Choose the source for every beat, then describe what happens next.</small></span><button className="icon-button" aria-label="Close continuation script" onClick={() => setModalOpen(false)}><X size={18} /></button></header>
      <div className="continue-beats">{script.beats.map((beat, index) => { const job = beatJobs.get(beat.id); const beatSource = sourceFor(beat); const beatMethod: ContinueMethod = method === 'motion' && (!beatSource || !('status' in beatSource) || !beatSource.latentFile) ? 'last' : method; const sourceCharacters = beatSource && 'status' in beatSource ? beatSource.continuityState?.characters ?? [] : []; const sourceChoice = beat.sourceMode === 'beat' && beat.sourceBeatId ? `beat:${beat.sourceBeatId}` : index === 0 || beat.sourceMode === 'original' ? 'original' : 'previous'; const duplicateName = script.beats.some(item => item.id !== beat.id && item.name.trim().toLocaleLowerCase() === beat.name.trim().toLocaleLowerCase()); const timing = continuationTiming(beat.duration, beatMethod === 'motion' ? beat.contextFrames : 0, beat.blendFrames); return <article className={`continue-beat ${job && ['queued', 'running'].includes(job.status) ? 'active-render' : ''}`} key={beat.id}><div className="continue-beat-heading"><strong>Beat {index + 1}</strong><span role="status">{job?.status ?? 'Planned'}</span><div><button title="Move up" aria-label={`Move beat ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button title="Move down" aria-label={`Move beat ${index + 1} down`} disabled={index === script.beats.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button title="Duplicate" aria-label={`Duplicate beat ${index + 1}`} onClick={() => setScript(current => { const beats = [...current.beats]; beats.splice(index + 1, 0, { ...beat, id: createId(), name: nextBeatName(current.beats) }); return { ...current, beats } })}><Copy size={15} /></button><button title="Branch from this beat" aria-label={`Branch from beat ${index + 1}`} onClick={() => insert(index, beat.id)}><GitBranch size={15} /></button><button title="Delete" aria-label={`Delete beat ${index + 1}`} disabled={script.beats.length === 1} onClick={() => setScript(current => ({ ...current, beats: normalizeBeatSources(current.beats.filter(item => item.id !== beat.id)) }))}><Trash2 size={15} /></button></div></div>
        <label>Unique beat name<input value={beat.name} maxLength={48} aria-invalid={duplicateName || !beat.name.trim()} onChange={event => updateBeat(beat.id, { name: event.target.value })} placeholder={`Beat ${index + 1} name`} />{duplicateName && <small className="continue-field-error">This name is already used by another beat.</small>}</label>
        <label className="continue-render-source">Render from<select value={sourceChoice} onChange={event => { const choice = event.target.value; updateBeat(beat.id, choice.startsWith('beat:') ? { sourceMode: 'beat', sourceBeatId: choice.slice(5) } : { sourceMode: choice as 'previous' | 'original', sourceBeatId: undefined }) }}>{index > 0 && <option value="previous">Previous beat · Beat {index}</option>}<option value="original">Original source clip</option>{script.beats.slice(0, index).map((candidate, candidateIndex) => <option value={`beat:${candidate.id}`} key={candidate.id}>Specific beat · Beat {candidateIndex + 1}</option>)}</select><small>{sourceChoice === 'original' ? 'This beat starts again from the selected source clip.' : sourceChoice === 'previous' ? `This beat continues from Beat ${index}.` : `This beat branches from Beat ${script.beats.findIndex(item => item.id === beat.sourceBeatId) + 1}.`}</small></label>
        <div className="continue-output-name"><small>{index === script.beats.length - 1 ? 'Final combined output' : 'Combined output lineage'}</small><code>{continuationOutputName(script, beat)}</code></div>
        <label>What happens next?<textarea value={beat.prompt} rows={3} placeholder="Describe only what changes next…" onChange={event => updateBeat(beat.id, { prompt: event.target.value })} /></label>
        <div className="continue-beat-controls"><label>New beat duration <input type="number" min="1" max="15" step="0.5" value={beat.duration} onChange={event => updateBeat(beat.id, { duration: Math.max(1, Math.min(15, Number(event.target.value) || 5)) })} /> seconds<small>{timing.renderFrames > 362 ? 'Reduce duration or motion context; raw H3 frames exceed the 15-second limit.' : beatMethod === 'motion' ? `About ${timing.deliveredDuration.toFixed(2)}s on H3’s frame grid. Only the ${timing.trimFrames} repeated motion-context frames are removed${beat.blendFrames ? `; ${beat.blendFrames} seam frames are blended` : ''}.` : `About ${timing.deliveredDuration.toFixed(2)}s on H3’s frame grid. No generated opening frames are discarded${beat.blendFrames ? `; ${beat.blendFrames} seam frames are blended` : ''}.`}</small></label>{method === 'frame' && <label>Source frame <input type="range" min="0" max={Math.max(0, (beatFrameDurations[beat.id] ?? frameDuration) - 0.05)} step="0.04" value={beat.frameTime} onChange={event => updateBeat(beat.id, { frameTime: Number(event.target.value) })} />{beat.frameTime.toFixed(2)}s</label>}</div>
        {method === 'frame' && (() => { const frameSource = sourceFor(beat); const url = frameSource ? 'status' in frameSource ? frameSource.outputUrl : frameSource.preview : undefined; return url ? <video className="continue-frame-preview" src={url} muted playsInline preload="metadata" onLoadedMetadata={event => { setBeatFrameDurations(current => ({ ...current, [beat.id]: event.currentTarget.duration || 0 })); event.currentTarget.currentTime = beat.frameTime }} ref={element => { if (element && element.readyState >= 1 && Math.abs(element.currentTime - beat.frameTime) > 0.06) element.currentTime = beat.frameTime }} /> : null })()}
        <details><summary>Continuity settings</summary><div className="continue-advanced"><label>Dialogue behavior<select value={beat.dialogueMode ?? 'inherit'} onChange={event => updateBeat(beat.id, { dialogueMode: event.target.value as NonNullable<ContinueBeat['dialogueMode']> })}><option value="inherit">Inherited from source</option><option value="none">No dialogue</option><option value="allow">Dialogue allowed</option></select><small>No dialogue also removes carried voice audio from Motion Context.</small></label>{method === 'motion' && <><label>Latent context frames <input type="number" min="1" max="39" value={beat.contextFrames} onChange={event => updateBeat(beat.id, { contextFrames: Math.max(1, Math.min(39, Number(event.target.value) || 22)) })} /></label><label><input type="checkbox" checked={beat.carryAudio} onChange={event => updateBeat(beat.id, { carryAudio: event.target.checked })} />Phase-lock audio tail (off uses audio as a sound reference)</label></>}<label>Seam blend frames <input type="number" min="0" max="16" value={beat.blendFrames} onChange={event => updateBeat(beat.id, { blendFrames: Math.max(0, Math.min(16, Number(event.target.value) || 0)) })} /></label>
          <label>Camera override <input value={beat.cameraOverride} onChange={event => updateBeat(beat.id, { cameraOverride: event.target.value })} placeholder="Optional change to camera direction or lens" /></label><label><input type="checkbox" checked={beat.continuityBreak} onChange={event => updateBeat(beat.id, { continuityBreak: event.target.checked })} />Intentional continuity break</label>
          {script.mode === 'reference' && <div className="continue-replacements"><strong>References · Inherited</strong>{(['character', 'wardrobe', 'location', 'prop'] as const).map(role => <div key={role}><span>{role}: {beat.replacements[role]?.name ?? 'Inherited'}</span>{beat.replacements[role] && (role === 'character' || role === 'wardrobe') && sourceCharacters.length > 1 && <select aria-label={`Character for ${role} replacement`} value={beat.replacementOwnerIds?.[role] ?? ''} onChange={event => updateBeat(beat.id, { replacementOwnerIds: { ...beat.replacementOwnerIds, [role]: event.target.value || undefined } })}><option value="">Choose character</option>{sourceCharacters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}<button className="secondary-button" onClick={() => void chooseReplacement(beat, role)}>Replace</button>{beat.replacements[role] && <button className="icon-button" aria-label={`Restore inherited ${role}`} onClick={() => { const replacements = { ...beat.replacements }; delete replacements[role]; const replacementOwnerIds = { ...beat.replacementOwnerIds }; if (role === 'character' || role === 'wardrobe') delete replacementOwnerIds[role]; updateBeat(beat.id, { replacements, replacementOwnerIds }) }}><X size={13} /></button>}</div>)}</div>}</div></details>
        {job && <ContinuationRenderPreview job={job} livePreview={livePreview} compact />}
        {job?.error && <p className="continue-error">{job.error}</p>}
        {job && ['queued', 'running'].includes(job.status) ? <button className="danger-button" disabled={cancellingIds.has(job.id)} onClick={() => void cancel(job)}><CircleStop size={14} />{cancellingIds.has(job.id) ? 'Stopping…' : 'Cancel beat'}</button> : <button className="secondary-button" disabled={Boolean(preparing)} onClick={() => void launch(beat)}>{job ? <RefreshCw size={14} /> : <Plus size={14} />}{job ? 'Regenerate beat' : 'Generate beat'}</button>}
      </article> })}</div>
      {error && <p className="continue-error" role="alert">{error}</p>}
      <footer><button className="secondary-button" onClick={() => insert(script.beats.length - 1)}><Plus size={15} />Add beat</button><span /><button className="secondary-button" disabled={Boolean(preparing)} onClick={() => { const next = script.beats.find(beat => !beatJobs.get(beat.id) || ['failed', 'cancelled'].includes(beatJobs.get(beat.id)?.status ?? '')); if (next) void launch(next) }}>Generate Next</button><button className="primary-button" disabled={Boolean(preparing) || runningAll} onClick={() => { launched.current.clear(); setError(''); setRunningAll(true) }}>{runningAll ? 'Generating sequence…' : 'Generate All'}</button></footer>
    </section></div>}
  </div>
}
