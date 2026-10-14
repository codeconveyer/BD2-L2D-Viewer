import characterListZh from '@/utils/character_list_zh'
import costumeListZh from '@/utils/costume_list_zh'
import type { Character } from '@/stores/characterStore'

export function isChineseBrowser() {
  if (typeof navigator === 'undefined') return false
  return /^zh(?:-|$)/i.test(navigator.language)
}

export function getCostumeDisplayName(costumeName: string) {
  if (!isChineseBrowser()) return costumeName
  return costumeListZh[costumeName]?.trim() || costumeName
}

export function getCharacterDisplayName(character: Pick<Character, 'charName'>) {
  if (!isChineseBrowser()) return character.charName
  return characterListZh[character.charName]?.trim() || character.charName
}
