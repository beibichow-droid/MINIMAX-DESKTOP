import { Check, ChevronDown, Image as ImageIcon } from 'lucide-react'
import { compileScene } from '../lib/h3SceneCompiler'
import type { ScenePromptState } from '../lib/scenePromptState'

export function SceneContextPanels({ state, onChange }: { state: ScenePromptState; onChange(state: ScenePromptState): void }) {
  const output = compileScene(state)
  const preserved = state.references.filter(ref => ref.preserve.length)
  const environment = preserved.find(ref => ref.preserve.includes('environment'))
  const wardrobe = preserved.find(ref => ref.preserve.includes('wardrobe'))
  const lighting = preserved.find(ref => ref.preserve.includes('lighting'))
  const sourceLabel = (id?: string) => output.references.find(ref => ref.id === id)?.label.replace(/[<>]/g, '') || 'Scene'
  return <div className="scene-context-panels">
    <section className="scene-context-card"><header><strong>Scene Continuity</strong><label>Use scene continuity<input aria-label="Use scene continuity" type="checkbox" role="switch" checked={state.continuity.scene} onChange={event => onChange({ ...state, continuity: { ...state.continuity, scene: event.target.checked } })} /></label></header>
      <div className="scene-context-content"><div className="scene-context-thumbnail">{environment?.file.preview ? <img src={environment.file.preview} alt="Preserved environment" /> : <ImageIcon size={25} />}</div><dl><dt>Location</dt><dd>{state.environment.value || environment?.observed.environment || (environment ? sourceLabel(environment.id) : 'From scene')}</dd><dt>Character</dt><dd>{state.characters.map(character => character.name).join(', ') || 'From scene'}</dd><dt>Wardrobe</dt><dd>{wardrobe ? `From ${sourceLabel(wardrobe.id)}` : 'From scene'}</dd><dt>Lighting</dt><dd>{state.lighting.value || lighting?.observed.lighting || (lighting ? sourceLabel(lighting.id) : 'From scene')}</dd><dt>Camera</dt><dd>{state.continuity.camera ? 'Axis & screen direction locked' : 'New composition allowed'}</dd></dl></div>
      <small>{state.references.some(ref => ref.anchor === 'opening') ? 'Opening frame is a literal 0.00s anchor.' : 'Preservation carries visual attributes into a newly composed shot.'}</small>
    </section>
    <section className="scene-context-card"><header><strong>Reference Analysis</strong><span>{state.references.length} sources</span></header>{state.references.length ? <div className="scene-reference-analysis">{state.references.map(ref => <div key={ref.id}><b>{sourceLabel(ref.id)}</b><span>{ref.anchor ? `${ref.anchor} frame` : ref.preserve.join(' · ') || ref.audio?.layer || ref.videoRole || 'Assign a role'}</span>{output.conflicts.some(conflict => conflict.referenceId === ref.id && conflict.severity === 'error') ? <em>Review</em> : <Check size={13} />}</div>)}</div> : <p>Add references to see their assigned roles here.</p>}<details><summary>View retained details <ChevronDown size={12} /></summary>{output.subjects.map(subject => <p key={subject.label}><b>{subject.name}</b><br />{subject.attributes.join(' · ')}<br /><small>Excluded: {subject.excluded.join(', ')}</small></p>)}</details></section>
    <section className="scene-context-card"><header><strong>H3 Prompt Status</strong><span className={output.conflicts.some(conflict => conflict.severity === 'error') ? 'needs-review' : 'ready'}>{output.conflicts.some(conflict => conflict.severity === 'error') ? 'Needs review' : 'Scene valid'}</span></header><div className="scene-context-stats">{[['Mode', output.mode], ['Subjects', output.subjects.length], ['Shots', state.shots.length], ['Duration', `${state.duration}s`]].map(([label, text]) => <div key={label}><small>{label}</small><strong>{text}</strong></div>)}</div>{output.conflicts.length > 0 && <button type="button" className="scene-review-link" onClick={() => document.querySelector('.scene-issues')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>View {output.conflicts.length} items and how to fix them →</button>}</section>
  </div>
}
