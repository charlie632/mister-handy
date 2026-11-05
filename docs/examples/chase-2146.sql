-- CHASE-2146 "Workspace-scoped applications" as the storage model would hold it on 2026-11-04 ~18:15 UTC.
-- Sources: coordinator thread 23dd0461-15ee-4f58-9fb0-94c0b0f66cc2, Jira epic CHASE-2146, gh pr view.
-- Dependencies marked "inferred" were not stated in the thread; Jira has no Blocks links at all.

INSERT INTO project VALUES
  ('chase-2146', 'Workspace-scoped applications', 'Active', 'CHASE-2146',
   '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-03T00:35:37Z');

INSERT INTO project_reference VALUES
  ('chase-2146', 'Design doc (Revised design, Implementation notes)', 'https://claude.ai/artifact/JmAthWKDdCUo7c6GmEcPCU'),
  ('chase-2146', 'Jira epic CHASE-2146', 'https://cerby.atlassian.net/browse/CHASE-2146');

INSERT INTO plan_step (project_slug, step_id, title, ticket_key, position, closed_as, closed_at) VALUES
  ('chase-2146', 'route-readers',      'Route readers that bypass the applications aggregate through it',            'CHASE-2148', 1, NULL, NULL),
  ('chase-2146', 'require-viewer',     'Make a viewer argument required on every application read',                   'CHASE-2149', 2, NULL, NULL),
  ('chase-2146', 'unique-name',        'Make applications.name unique in the database',                               'CHASE-2147', 3, NULL, NULL),
  ('chase-2146', 'access-table',       'Add the application_access table',                                            'CHASE-2157', 4, NULL, NULL),
  ('chase-2146', 'rule-reads-access',  'Make the application visibility rule read application_access',               'CHASE-2158', 5, NULL, NULL),
  ('chase-2146', 'fail-closed-delete', 'Deleting a workspace makes an app shared only with it global',               'CHASE-2162', 6, 'Done', '2026-11-04T15:07:59Z'),
  ('chase-2146', 'cache-by-viewer',    'Key the search DocumentBuilder application cache by viewer',                  'CHASE-2153', 7, NULL, NULL),
  ('chase-2146', 'internal-api-reads', 'Move ApplicationInternalApi reads to ApplicationQueries',                     'CHASE-2154', 8, NULL, NULL),
  ('chase-2146', 'draft-access-rows',  'Write application_access rows when a workspace creates a draft application', 'CHASE-2159', 9, NULL, NULL),
  ('chase-2146', 'promote-or-share',   'Promote or share a workspace-scoped application',                             'CHASE-2160', 10, NULL, NULL);

INSERT INTO dependency VALUES
  ('chase-2146', 'route-readers',     'require-viewer'),     -- stated: "start CHASE-2149 stacked on top of CHASE-2148"
  ('chase-2146', 'unique-name',       'access-table'),       -- stated: "stacked PRs on top of CHASE-2147"
  ('chase-2146', 'access-table',      'rule-reads-access'),  -- stated: Option 2 order
  ('chase-2146', 'require-viewer',    'rule-reads-access'),  -- inferred: the rule takes the viewer 2149 added
  ('chase-2146', 'rule-reads-access', 'cache-by-viewer'),    -- inferred: "once visibility is scoped"
  ('chase-2146', 'require-viewer',    'internal-api-reads'), -- inferred: follow-up filed on #36673
  ('chase-2146', 'cache-by-viewer',   'draft-access-rows'),  -- stated: "has to land before step 5"
  ('chase-2146', 'rule-reads-access', 'draft-access-rows'),  -- stated: Option 2 order
  ('chase-2146', 'draft-access-rows', 'promote-or-share');   -- stated: Option 2 order

INSERT INTO step_thread (project_slug, step_id, env_id, thread_id, started_at) VALUES
  ('chase-2146', 'route-readers',     '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4a98bbb9-64a7-4ae6-a3b8-6129a1424e15%3Adelegate-task%3A2b580467-f2ad-4d19-b611-09d8c99bff1f', '2026-11-03T15:13:47Z'),
  ('chase-2146', 'require-viewer',    '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4a98bbb9-64a7-4ae6-a3b8-6129a1424e15%3Adelegate-task%3A5f210a10-168e-49a4-9737-5ba8438c7a0d', '2026-11-03T15:50:33Z'),
  ('chase-2146', 'require-viewer',    '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4cf384b3-5ea0-4c87-8384-1e6e7a8335b2%3Adelegate-task%3A87549a45-7a3f-4da9-b425-5d474426b6be', '2026-11-03T18:51:52Z'),
  ('chase-2146', 'unique-name',       '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'mcp:3ee8d50c-e85e-4de7-b0fd-3378ca3081b9', '2026-11-03T23:44:17Z'),
  ('chase-2146', 'access-table',      '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A429a43e7-2449-4dc1-84c0-9d25a9c1c22b%3Adelegate-task%3A21d6034d-9e84-448b-b21d-21ee78545438', '2026-11-04T03:04:28Z'),
  ('chase-2146', 'rule-reads-access', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'mcp:b12b11d4-a70c-4747-a77f-caa40712edb6', '2026-11-04T03:08:38Z'),
  ('chase-2146', 'rule-reads-access', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:provider:claudeAgent:native-thread:provider-thread%3Aprovider%3AclaudeAgent%3Anative-thread%3Apending%253Arun%253Athread%253A23dd0461-15ee-4f58-9fb0-94c0b0f66cc2%253Aordinal%253A1%3Aad213b4c3205242db', '2026-11-04T15:02:30Z');

INSERT INTO step_pull_request VALUES
  ('chase-2146', 'route-readers',     'https://github.com/cerbyinc/platform/pull/36660', '2026-11-03T15:30:00Z'),
  ('chase-2146', 'require-viewer',    'https://github.com/cerbyinc/platform/pull/36673', '2026-11-03T18:20:00Z'),
  ('chase-2146', 'require-viewer',    'https://github.com/cerbyinc/platform/pull/36686', '2026-11-03T20:00:00Z'),
  ('chase-2146', 'unique-name',       'https://github.com/cerbyinc/platform/pull/36701', '2026-11-04T02:30:00Z'),
  ('chase-2146', 'access-table',      'https://github.com/cerbyinc/platform/pull/36710', '2026-11-04T03:08:00Z'),
  ('chase-2146', 'rule-reads-access', 'https://github.com/cerbyinc/platform/pull/36711', '2026-11-04T03:30:00Z');

INSERT INTO thread_observation VALUES
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4a98bbb9-64a7-4ae6-a3b8-6129a1424e15%3Adelegate-task%3A2b580467-f2ad-4d19-b611-09d8c99bff1f', 'Settled', 'CHASE-2148 route application readers through the aggregate', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4a98bbb9-64a7-4ae6-a3b8-6129a1424e15%3Adelegate-task%3A5f210a10-168e-49a4-9737-5ba8438c7a0d', 'Idle', 'CHASE-2149 required viewer on application reads', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A4cf384b3-5ea0-4c87-8384-1e6e7a8335b2%3Adelegate-task%3A87549a45-7a3f-4da9-b425-5d474426b6be', 'Settled', 'Review and fix bot findings on PR #36673', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'mcp:3ee8d50c-e85e-4de7-b0fd-3378ca3081b9', 'Settled', 'CHASE-2147 unique applications.name migration', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:delegated-task:command%3Amcp%3A429a43e7-2449-4dc1-84c0-9d25a9c1c22b%3Adelegate-task%3A21d6034d-9e84-448b-b21d-21ee78545438', 'Settled', 'CHASE-2157 application_access migration', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'mcp:b12b11d4-a70c-4747-a77f-caa40712edb6', 'Settled', 'CHASE-2158 visibility rule reads application_access', '2026-11-04T18:15:00Z'),
  ('3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', 'thread:provider:claudeAgent:native-thread:provider-thread%3Aprovider%3AclaudeAgent%3Anative-thread%3Apending%253Arun%253Athread%253A23dd0461-15ee-4f58-9fb0-94c0b0f66cc2%253Aordinal%253A1%3Aad213b4c3205242db', 'Idle', 'Rewrite CHASE-2158 rule over restricted flag', '2026-11-04T18:15:00Z');

INSERT INTO pull_request_observation VALUES
  ('https://github.com/cerbyinc/platform/pull/36660', 'Merged', NULL, '2026-11-04T18:15:00Z'),
  ('https://github.com/cerbyinc/platform/pull/36673', 'Merged', NULL, '2026-11-04T18:15:00Z'),
  ('https://github.com/cerbyinc/platform/pull/36686', 'Open',   NULL, '2026-11-04T18:15:00Z'),
  ('https://github.com/cerbyinc/platform/pull/36701', 'Merged', NULL, '2026-11-04T18:15:00Z'),
  ('https://github.com/cerbyinc/platform/pull/36710', 'Merged', NULL, '2026-11-04T18:15:00Z'),
  ('https://github.com/cerbyinc/platform/pull/36711', 'Merged', NULL, '2026-11-04T18:15:00Z');

INSERT INTO ticket_observation VALUES
  ('CHASE-2147', 'Done',  '2026-11-04T18:15:00Z'),
  ('CHASE-2148', 'Done',  '2026-11-04T18:15:00Z'),
  ('CHASE-2149', 'Done',  '2026-11-04T18:15:00Z'),
  ('CHASE-2153', 'To Do', '2026-11-04T18:15:00Z'),
  ('CHASE-2154', 'To Do', '2026-11-04T18:15:00Z'),
  ('CHASE-2157', 'Done',  '2026-11-04T18:15:00Z'),
  ('CHASE-2158', 'Done',  '2026-11-04T18:15:00Z'),
  ('CHASE-2159', 'To Do', '2026-11-04T18:15:00Z'),
  ('CHASE-2160', 'To Do', '2026-11-04T18:15:00Z'),
  ('CHASE-2162', 'Done',  '2026-11-04T18:15:00Z');

INSERT INTO status_update VALUES
  ('u-2148-start', 'chase-2146', 'route-readers',     'StepStarted',       '{}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-03T15:13:47Z'),
  ('u-2149-start', 'chase-2146', 'require-viewer',    'StepStarted',       '{}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-03T15:50:33Z'),
  ('u-36673',      'chase-2146', 'require-viewer',    'PullRequestOpened', '{"url":"https://github.com/cerbyinc/platform/pull/36673"}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-03T18:20:00Z'),
  ('u-2147-start', 'chase-2146', 'unique-name',       'StepStarted',       '{}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-03T23:44:17Z'),
  ('u-2157-start', 'chase-2146', 'access-table',      'StepStarted',       '{}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-04T03:04:28Z'),
  ('u-2158-start', 'chase-2146', 'rule-reads-access', 'StepStarted',       '{}', '3f5a1a0c-10ca-4c98-afdc-8bcc9e3a3b30', '23dd0461-15ee-4f58-9fb0-94c0b0f66cc2', '2026-11-04T03:08:38Z');
