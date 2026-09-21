import type { ContinueBeat, ContinueScript } from '../components/ContinueWorkspace'

export const continuationBeatSignature = (beat: ContinueBeat, videoName = '', route = '') => JSON.stringify({ name: beat.name, videoName, route, prompt: beat.prompt, duration: beat.duration, frameTime: beat.frameTime, contextFrames: beat.contextFrames, blendFrames: beat.blendFrames, carryAudio: beat.carryAudio, dialogueMode: beat.dialogueMode ?? 'inherit', cameraOverride: beat.cameraOverride, continuityBreak: beat.continuityBreak, sourceMode: beat.sourceMode ?? 'previous', sourceBeatId: beat.sourceBeatId, replacements: Object.entries(beat.replacements).map(([role, file]) => [role, file?.path, beat.replacementOwnerIds?.[role as keyof ContinueBeat['replacementOwnerIds']]]) })

export function continuationFilenamePart(value: string, fallback: string, maxLength = 48) {
  return value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, maxLength) || fallback.slice(0, maxLength)
}

export function continuationLineage(script: ContinueScript, target: ContinueBeat) {
  const lineage: ContinueBeat[] = []
  const seen = new Set<string>()
  let current: ContinueBeat | undefined = target
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    lineage.unshift(current)
    const index = script.beats.findIndex(beat => beat.id === current?.id)
    const parentId: string | undefined = current.sourceMode === 'original' ? undefined : current.sourceMode === 'beat' ? current.sourceBeatId : script.beats[index - 1]?.id
    current = parentId ? script.beats.find(beat => beat.id === parentId) : undefined
  }
  return lineage
}

export function continuationOutputStem(script: ContinueScript, target: ContinueBeat) {
  const video = continuationFilenamePart(script.videoName, 'Untitled-Video')
  const lineage = continuationLineage(script, target)
  // Keep every beat visible while staying below common filesystem component
  // limits. Longer scripts shorten each label evenly instead of dropping
  // middle beats and making the saved lineage misleading.
  const nameBudget = Math.max(6, Math.min(48, Math.floor((198 - video.length - lineage.length * 10) / Math.max(1, lineage.length))))
  const chain = lineage.map(beat => {
    const index = script.beats.findIndex(item => item.id === beat.id) + 1
    return `beat${index}-${continuationFilenamePart(beat.name, `Beat-${index}`, nameBudget)}`
  })
  return `${video}__${chain.join('_')}`
}

export function continuationOutputName(script: ContinueScript, target: ContinueBeat) {
  const video = continuationFilenamePart(script.videoName, 'Untitled-Video')
  const lineage = continuationOutputStem(script, target)
  const filename = script.beats.at(-1)?.id === target.id ? `Final_${lineage}` : lineage
  return `continuations/${video}/${filename}`
}

export function continuationTiming(seconds: number, overlapFrames: number, blendFrames = 0) {
  const requestedFrames = Math.max(1, Math.round(seconds * 24))
  const overlap = Math.max(0, Math.round(overlapFrames))
  const blend = Math.max(0, Math.round(blendFrames))
  const targetRaw = requestedFrames + overlap + blend
  // H3 accepts temporal lengths in the 5 + 17k family. Pick the closest grid
  // point to the requested delivered duration. Grid surplus is real generated
  // motion and must never be removed from the head of the clip.
  const renderFrames = Math.max(5, 5 + Math.round((targetRaw - 5) / 17) * 17)
  // Loop Trim removes only the repeated guide returned by the motion-context
  // node. A merge crossfade consumes blend frames from the total timeline.
  const trimFrames = overlap
  const deliveredFrames = Math.max(1, renderFrames - trimFrames - blend)
  // The public duration control tops out at 15s, which H3 maps to its final
  // valid grid length of 362 frames. Preserve that accepted input at the
  // boundary instead of exposing 362/24 as an invalid 15.08s control value.
  const renderDuration = renderFrames <= 362 ? Math.min(15, renderFrames / 24) : renderFrames / 24
  return { requestedFrames, renderFrames, trimFrames, deliveredFrames, renderDuration, deliveredDuration: deliveredFrames / 24 }
}

export function continuationPreviousAction(
  script: ContinueScript,
  source: { continuation?: { scriptId: string; beatId: string }; continuityState?: { scene: string } },
) {
  if (!source.continuation) return source.continuityState?.scene.trim() ?? ''
  if (source.continuation.scriptId !== script.id) return ''
  return script.beats.find(beat => beat.id === source.continuation?.beatId)?.prompt.trim() ?? ''
}
