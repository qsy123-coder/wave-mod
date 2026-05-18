export function buildOssObjectKey({
  character,
  modId,
  filename,
}: {
  character: string;
  modId: string;
  filename: string;
}) {
  const normalizedCharacter = character.trim().toLowerCase();

  return `mods/${normalizedCharacter}/${modId}/${filename}`;
}
