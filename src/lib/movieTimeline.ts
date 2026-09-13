import type { MovieEditorProject } from '../types'

export function preserveLockedClips(before: MovieEditorProject, after: MovieEditorProject) {
    const locked = new Set(before.tracks.filter((track) => track.locked).map((track) => track.id))
    const protectedIds = new Set(before.clips.filter((clip) => locked.has(clip.trackId)).map((clip) => clip.id))
    return [...after.clips.filter((clip) => !locked.has(clip.trackId) && !protectedIds.has(clip.id)), ...before.clips.filter((clip) => locked.has(clip.trackId))]
  }
