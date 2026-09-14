import { Check, ChevronDown, Image as ImageIcon } from 'lucide-react'
import { compileScene } from '../lib/h3SceneCompiler'
import { value, type ScenePromptState } from '../lib/scenePromptState'

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
