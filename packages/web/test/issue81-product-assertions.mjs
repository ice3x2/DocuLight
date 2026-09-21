import assert from 'node:assert/strict';

const rgb = (value) => {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `unreadable color: ${value}`);
  return channels;
};

const luminance = (value) => rgb(value)
  .map((part) => { const channel = part / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; })
  .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

export const contrastRatio = (foreground, background) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

export function assertSameMountedTransition(value) {
  assert.equal(value.mountIdAfter, value.mountIdBefore, 'component remounted');
  assert.equal(value.queryAfter, value.queryBefore, 'query changed');
  assert.equal(value.candidateIdAfter, value.candidateIdBefore, 'candidate context changed');
  assert.equal(value.groupIdAfter, value.groupIdBefore, 'group context changed');
  assert.equal(value.focusedIdAfter, value.focusedIdBefore, 'focus changed');
  assert.equal(value.writesAfter, value.writesBefore, 'transition dispatched a write');
  assert.deepEqual(value.zoomReads, [1, 2, 1], 'zoom was not separately read as 100→200→100');
}

export function assertEnvironmentEvidence(value) {
  assert(value.normalTextContrast >= 4.5, `normal text contrast ${value.normalTextContrast}`);
  assert(value.largeTextContrast >= 3, `large text contrast ${value.largeTextContrast}`);
  assert(value.controlContrast >= 3, `control contrast ${value.controlContrast}`);
  assert(value.focusContrast >= 3, `focus contrast ${value.focusContrast}`);
  assert(value.borderContrast >= 3, `border contrast ${value.borderContrast}`);
  assert.equal(value.firstResultReachable, true, 'first result unreachable');
  assert.equal(value.lastResultReachable, true, 'last result unreachable');
  assert.equal(value.manyMemberLastReachable, true, 'many-member tail unreachable');
  assert.equal(value.longNameReachable, true, 'long group name unreachable');
}
