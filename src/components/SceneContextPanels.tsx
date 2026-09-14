import { Check, ChevronDown, Image as ImageIcon } from 'lucide-react'
import { compileScene } from '../lib/h3SceneCompiler'
import { cameraOptions, defaultPreservedAttributes, preserveAttributes, value, type Camera, type ScenePromptState, type SceneReference } from '../lib/scenePromptState'
import type { SceneInspectorSelection } from './SceneComposer'

export function SceneSelectionInspector({ state, selection, onChange }: { state: ScenePromptState; selection: SceneInspectorSelection; onChange(state: ScenePromptState): void }) {
  const reference = selection.kind === 'reference' ? state.references.find(item => item.id === selection.id) : undefined
  const shotIndex = selection.kind === 'shot' ? state.shots.findIndex(item => item.id === selection.id) : -1
  const shot = shotIndex >= 0 ? state.shots[shotIndex] : undefined
  const camera = shotIndex === 0 ? state.camera : shot?.camera ?? {}
  const updateReference = (update: Partial<SceneReference>) => reference && onChange({ ...state, references: state.references.map(item => item.id === reference.id ? { ...item, ...update } : item) })
  const updateCamera = (key: keyof Camera, text: string) => {
    if (!shot) return
    if (shotIndex === 0) onChange({ ...state, camera: { ...state.camera, [key]: value(text) } })
    else onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, camera: { ...item.camera, [key]: value(text) } } : item) })
  }

  if (reference) return <section className="scene-context-card selection-inspector">
    <header><div><small>SELECTED REFERENCE</small><strong>{reference.name}</strong></div><span>{reference.file.kind}</span></header>
    <div className="selection-reference-summary">{reference.file.preview ? <img src={reference.file.preview} alt="" /> : <ImageIcon size={28} />}<div><b>{reference.file.referenceRole || 'Unassigned reference'}</b><small>{reference.ownerId ? state.characters.find(item => item.id === reference.ownerId)?.name || 'Assigned character' : 'Scene level'}</small></div></div>
    <label>Owner<select value={reference.ownerId || ''} onChange={event => updateReference({ ownerId: event.target.value || undefined })}><option value="">Scene / environment</option>{state.characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
    {reference.file.kind === 'image' && <label>Frame role<select value={reference.anchor || ''} onChange={event => updateReference({ anchor: event.target.value as SceneReference['anchor'] || undefined, reviewed: false })}><option value="">Reusable reference</option><option value="opening">Opening frame · 0.00s</option><option value="ending">Ending frame</option><option value="keyframe">Keyframe</option></select></label>}
    {reference.file.kind === 'video' && <label>Video role<select value={reference.videoRole} onChange={event => updateReference({ videoRole: event.target.value as SceneReference['videoRole'] })}>{['motion', 'structure', 'continuation', 'editing'].map(role => <option key={role}>{role}</option>)}</select></label>}
    <div className="selection-toggle-heading"><strong>Preserve from source</strong><button type="button" onClick={() => updateReference({ preserve: reference.preserve.length ? [] : defaultPreservedAttributes(reference) })}>{reference.preserve.length ? 'Clear' : 'Use recommended'}</button></div>
    <div className="selection-attribute-grid">{preserveAttributes.map(attribute => <label key={attribute}><input type="checkbox" checked={reference.preserve.includes(attribute)} onChange={event => updateReference({ preserve: event.target.checked ? [...new Set([...reference.preserve, attribute])] : reference.preserve.filter(item => item !== attribute) })} />{attribute}</label>)}</div>
  </section>

  if (shot) return <section className="scene-context-card selection-inspector">
    <header><div><small>SELECTED SHOT</small><strong>Shot {shotIndex + 1}</strong></div><span>{shot.start.toFixed(2)}–{shot.end.toFixed(2)}s</span></header>
    <label>Shot action<textarea rows={3} value={shot.description} placeholder="Describe the action in this shot" onChange={event => onChange({ ...state, shots: state.shots.map((item, index) => index === shotIndex ? { ...item, description: event.target.value } : item) })} /></label>
    <div className="selection-camera-grid">{Object.entries(cameraOptions).map(([key, options]) => <label key={key}>{({ shotSize: 'Framing', angle: 'Angle', movement: 'Movement', speed: 'Speed', stabilization: 'Stabilization', amplitude: 'Amount' } as Record<string, string>)[key]}<select value={camera[key as keyof Camera]?.value || ''} onChange={event => updateCamera(key as keyof Camera, event.target.value)}><option value="">From scene</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>)}</div>
  </section>

  return <section className="scene-context-card selection-inspector">
    <header><div><small>SCENE CONTEXT</small><strong>Ref2VA direction</strong></div><span>{state.duration}s</span></header>
    <label>Environment<input value={state.environment.value} placeholder="Location and physical environment" onChange={event => onChange({ ...state, environment: value(event.target.value) })} /></label>
    <label>Lighting<input value={state.lighting.value} placeholder="Light source, time, atmosphere" onChange={event => onChange({ ...state, lighting: value(event.target.value) })} /></label>
    <small>Select a reference card or shot to edit its production controls here.</small>
  </section>
}

export function SceneContextPanels({ state, onChange }: { state: ScenePromptState; onChange(state: ScenePromptState): void }) {
  const output = compileScene(state)
  const preserved = state.references.filter(ref => ref.preserve.length)
  const environment = preserved.find(ref => ref.preserve.includes('environment'))
  const wardrobe = preserved.find(ref => ref.preserve.includes('wardrobe'))
  const lighting = preserved.find(ref => ref.preserve.includes('lighting'))
  const opening = state.references.find(ref => ref.anchor === 'opening')
  const sourceLabel = (id?: string) => output.references.find(ref => ref.id === id)?.label.replace(/[<>]/g, '') || 'Scene'
  const setContinuity = (key: 'scene' | 'camera' | 'exactFrame', checked: boolean) => onChange({ ...state, continuity: { ...state.continuity, [key]: checked } })

  return <div className="scene-context-panels">
    <section className="scene-context-card continuity-inspector"><header><strong>Continuity & locks</strong><span>{opening ? 'Opening anchored' : state.continuity.scene ? 'Scene linked' : 'New scene'}</span></header>
      <div className="continuity-switches">
        <label><span><strong>Scene continuity</strong><small>Keep world, cast, wardrobe, and lighting.</small></span><input aria-label="Use scene continuity" type="checkbox" role="switch" checked={state.continuity.scene} onChange={event => setContinuity('scene', event.target.checked)} /></label>
        <label><span><strong>Camera continuity</strong><small>Keep axis and screen direction.</small></span><input aria-label="Use camera continuity" type="checkbox" role="switch" checked={state.continuity.camera} onChange={event => setContinuity('camera', event.target.checked)} /></label>
        <label><span><strong>Exact-frame continuation</strong><small>Requires an opening-frame reference at 0.00s.</small></span><input aria-label="Continue exact previous frame" type="checkbox" role="switch" checked={state.continuity.exactFrame} onChange={event => setContinuity('exactFrame', event.target.checked)} /></label>
      </div>
      <input aria-label="Continuity notes" value={state.continuity.notes.value} onChange={event => onChange({ ...state, continuity: { ...state.continuity, notes: value(event.target.value) } })} placeholder="Optional continuity notes" />
      <div className="scene-context-content"><div className="scene-context-thumbnail">{environment?.file.preview ? <img src={environment.file.preview} alt="Preserved environment" /> : <ImageIcon size={25} />}</div><dl><dt>Location</dt><dd>{state.environment.value || environment?.observed.environment || (environment ? sourceLabel(environment.id) : 'From scene')}</dd><dt>Character</dt><dd>{state.characters.map(character => character.name).join(', ') || 'From scene'}</dd><dt>Wardrobe</dt><dd>{wardrobe ? `From ${sourceLabel(wardrobe.id)}` : 'From scene'}</dd><dt>Lighting</dt><dd>{state.lighting.value || lighting?.observed.lighting || (lighting ? sourceLabel(lighting.id) : 'From scene')}</dd><dt>Camera</dt><dd>{state.continuity.camera ? 'Axis locked' : 'New composition allowed'}</dd></dl></div>
      <small>{opening ? `${sourceLabel(opening.id)} is the literal visual state at 0.00s.` : state.continuity.exactFrame ? 'Add the previous final frame as an Opening Frame to satisfy exact continuation.' : 'Preserve carries selected attributes into a newly composed shot.'}</small>
    </section>

    <section className="scene-context-card"><header><strong>Reference analysis</strong><span>{state.references.length} sources</span></header>{state.references.length ? <div className="scene-reference-analysis">{state.references.map(ref => <div key={ref.id}><b>{sourceLabel(ref.id)}</b><span>{ref.anchor ? `${ref.anchor} frame` : ref.preserve.join(' · ') || ref.audio?.layer || ref.videoRole || 'Assign a role'}</span>{output.conflicts.some(conflict => conflict.referenceId === ref.id && conflict.severity === 'error') ? <em>Review</em> : <Check size={13} />}</div>)}</div> : <p>Add references to see their assigned roles here.</p>}<details><summary>Retained details <ChevronDown size={12} /></summary>{output.subjects.map(subject => <p key={subject.label}><b>{subject.name}</b><br />{subject.attributes.join(' · ')}<br /><small>Excluded: {subject.excluded.join(', ')}</small></p>)}</details></section>

    <section className="scene-context-card"><header><strong>H3 validation</strong><span className={output.conflicts.some(conflict => conflict.severity === 'error') ? 'needs-review' : 'ready'}>{output.conflicts.some(conflict => conflict.severity === 'error') ? 'Needs review' : 'Scene valid'}</span></header><div className="scene-context-stats">{[['Mode', output.mode], ['Subjects', output.subjects.length], ['Shots', state.shots.length], ['Duration', `${state.duration}s`]].map(([label, text]) => <div key={label}><small>{label}</small><strong>{text}</strong></div>)}</div>{output.conflicts.length > 0 && <button type="button" className="scene-review-link" onClick={() => document.querySelector('.scene-issues')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>View {output.conflicts.length} items and fixes →</button>}<details className="h3-state-debug"><summary>H3 mapping and compiled prompt <ChevronDown size={12} /></summary><pre>{JSON.stringify({ mode: output.mode, subjects: output.subjects, references: output.references, timing: output.timing, speakerIDs: output.speakers, conflicts: output.conflicts }, null, 2)}</pre><textarea aria-label="Final compiled H3 prompt" readOnly value={output.prompt} /></details></section>
  </div>
}
