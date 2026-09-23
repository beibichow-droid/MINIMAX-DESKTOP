import { ImagePlus, MapPin, Music2, Plus, Users, Video } from 'lucide-react'
import { characterReferences } from '../lib/characterLibrary'
import { locationReferences } from '../lib/locationLibrary'
import type { CharacterProject, LocationProject } from '../types'

interface ReferenceSourcePanelProps {
  characters: CharacterProject[]
  locations: LocationProject[]
  selectedCharacterIds: string[]
  selectedLocationIds: string[]
  imageCount: number
  videoCount: number
  audioCount: number
  onAddCharacter(id: string): void
  onAddLocation(id: string): void
  onChoose(kind: 'image' | 'video' | 'audio'): void
  onOpenCharacters(): void
  onOpenLocations(): void
}

export function ReferenceSourcePanel(props: ReferenceSourcePanelProps) {
  const readyCharacters = props.characters.filter(item => characterReferences(item).length)
  const readyLocations = props.locations.filter(item => locationReferences(item).length)
  return <section className="reference-source-panel" aria-label="Reference inputs">
    <header><span><strong>Reference inputs</strong><small>Choose reusable subjects and places, then add scene media.</small></span><span className="reference-source-total">{props.imageCount}/9 images · {props.videoCount}/3 videos · {props.audioCount}/3 audio</span></header>
    <details open><summary><Users size={16} /><span>Characters</span><small>{props.selectedCharacterIds.length} selected</small></summary><div className="reference-source-options">{readyCharacters.length ? readyCharacters.map(item => <button type="button" key={item.id} className={props.selectedCharacterIds.includes(item.id) ? 'selected' : ''} disabled={props.selectedCharacterIds.includes(item.id)} onClick={() => props.onAddCharacter(item.id)}>{characterReferences(item)[0]?.preview ? <img src={characterReferences(item)[0].preview} alt="" /> : <Users size={18} />}<span><strong>{item.name}</strong><small>{characterReferences(item).length} approved images</small></span><span>{props.selectedCharacterIds.includes(item.id) ? 'Added' : 'Add'}</span></button>) : <p>No characters with approved images yet. <button type="button" onClick={props.onOpenCharacters}>Open Character Studio</button></p>}</div></details>
    <details><summary><MapPin size={16} /><span>Locations</span><small>{props.selectedLocationIds.length} selected</small></summary><div className="reference-source-options">{readyLocations.length ? readyLocations.map(item => <button type="button" key={item.id} className={props.selectedLocationIds.includes(item.id) ? 'selected' : ''} disabled={props.selectedLocationIds.includes(item.id)} onClick={() => props.onAddLocation(item.id)}>{locationReferences(item)[0]?.preview ? <img src={locationReferences(item)[0].preview} alt="" /> : <MapPin size={18} />}<span><strong>{item.name}</strong><small>{locationReferences(item).length} approved images</small></span><span>{props.selectedLocationIds.includes(item.id) ? 'Added' : 'Add'}</span></button>) : <p>No locations with approved images yet. <button type="button" onClick={props.onOpenLocations}>Open Location Studio</button></p>}</div></details>
    <details><summary><ImagePlus size={16} /><span>Scene media</span><small>{props.imageCount + props.videoCount + props.audioCount} attached</small></summary><div className="reference-source-add"><button type="button" disabled={props.imageCount >= 9} onClick={() => props.onChoose('image')}><Plus size={14} /><ImagePlus size={16} />Image</button><button type="button" disabled={props.videoCount >= 3} onClick={() => props.onChoose('video')}><Plus size={14} /><Video size={16} />Video</button><button type="button" disabled={props.audioCount >= 3} onClick={() => props.onChoose('audio')}><Plus size={14} /><Music2 size={16} />Audio</button></div></details>
  </section>
}
