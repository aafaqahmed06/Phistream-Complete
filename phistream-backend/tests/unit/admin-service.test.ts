import { describe, expect, it } from 'vitest';

import { APPLICATION_STATUSES } from '../../src/db/schema/enums.js';
import { likeContains } from '../../src/modules/admin/admin.repository.js';
import { availableActions, labelAnswers } from '../../src/modules/admin/admin.service.js';
import { hasPermission, PERMISSIONS } from '../../src/modules/admin/permissions.js';
import { TEST_FORM } from '../helpers/fake-applications.js';

describe('permissions', () => {
  it('reserves audit logs for admins', () => {
    expect(hasPermission('ADMIN', 'audit_logs:read')).toBe(true);
    expect(hasPermission('REVIEWER', 'audit_logs:read')).toBe(false);
  });

  it('lets both roles read and review applications', () => {
    for (const permission of [
      'leads:read',
      'applications:read',
      'applications:decide',
      'applications:note',
    ] as const) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
      expect(hasPermission('REVIEWER', permission)).toBe(true);
    }
  });

  it('grants admins every permission', () => {
    for (const permission of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });
});

describe('availableActions', () => {
  it.each([
    ['NEW', ['review', 'note']],
    ['UNDER_REVIEW', ['accept', 'reject', 'note']],
    ['ACCEPTED', ['note']],
    ['SCHEDULING_OPEN', ['schedule', 'note']],
    ['SCHEDULED', ['note']],
    ['REJECTED', ['note']],
    ['ARCHIVED', ['note']],
  ] as const)('%s → %j', (status, expected) => {
    expect(availableActions(status, 'REVIEWER')).toEqual(expected);
  });

  it('never offers an action the state machine would refuse', () => {
    for (const status of APPLICATION_STATUSES) {
      const actions = availableActions(status, 'ADMIN');
      expect(actions.includes('accept')).toBe(status === 'UNDER_REVIEW');
      expect(actions.includes('reject')).toBe(status === 'UNDER_REVIEW');
      expect(actions.includes('review')).toBe(status === 'NEW');
    }
  });
});

describe('labelAnswers', () => {
  it('labels answers in question order and keeps unknown keys last', () => {
    expect(
      labelAnswers(TEST_FORM, [
        { questionKey: 'zz_removed', answer: 'x' },
        { questionKey: 'agree', answer: true },
        { questionKey: 'about', answer: 'Hi' },
      ]),
    ).toEqual([
      { questionKey: 'about', label: 'About', type: 'text', answer: 'Hi' },
      { questionKey: 'agree', label: 'Agree', type: 'boolean', answer: true },
      { questionKey: 'zz_removed', label: null, type: null, answer: 'x' },
    ]);
  });

  it('still returns every answer when the stored definition is a legacy placeholder', () => {
    expect(
      labelAnswers({ legacyPlaceholder: true, questions: [] }, [{ questionKey: 'q', answer: 1 }]),
    ).toEqual([{ questionKey: 'q', label: null, type: null, answer: 1 }]);
  });
});

describe('likeContains', () => {
  it.each([
    ['jane', '%jane%'],
    ['50%', '%50\\%%'],
    ['a_b', '%a\\_b%'],
    ['back\\slash', '%back\\\\slash%'],
  ])('escapes %j', (input, expected) => {
    expect(likeContains(input)).toBe(expected);
  });
});
