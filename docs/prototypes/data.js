/*
 * Shared data for the prototypes: one app's second exposure, at two moments.
 *
 * `grouping` is the workspace while the admin arranges VIPs, with things that
 * block planning. Its shape is the real GET /api/exposures/{id}, trimmed.
 *
 * `plan` is the same exposure later, in awaiting_confirmation, after the
 * blockers were fixed (Kerberos service excluded on a new scan, search
 * grouped, the registry URL filled in). The plan's shape is not built yet;
 * it follows exposure-design.md (Order of execution, Console). DNS names use
 * an illustrative convention: open question 1 is still open.
 */
window.PROTO = {
  app: { name: 'Payroll v3', url: 'https://payroll.corp.internal' },

  grouping: {
    id: 'exp_7c41e0a2b9',
    status: 'grouping',
    version: 4,
    scan_id: 'b3f0c2a9e1d84c6f9a1b2c3d4e5f6a7b',
    submitted_at: '2026-11-12 10:41',
    submitted_by: 'jchen',
    supersedes: 'exp_19ad03c4f2',
    groups: [
      { id: 'g1', services: ['reports', 'sso'] },
      { id: 'g2', services: ['directory'] }
    ],
    services: {
      reports: { origin: 'https://reports.corp.internal', auth: 'oauth', ips: ['10.20.4.31'], scope: 'needs_vip', found_by: ['interceptor'] },
      sso: { origin: 'https://sso.corp.internal', auth: 'login_redirect', ips: ['10.20.1.5', '10.20.1.6'], scope: 'needs_vip', found_by: ['interceptor', 'tracer'] },
      directory: { origin: 'https://directory.corp.internal', auth: 'kerberos', ips: ['10.20.1.40'], scope: 'needs_vip', found_by: ['interceptor', 'tracer'] },
      search: { origin: 'http://search.corp.internal:9200', auth: 'unauthenticated', ips: ['10.20.7.2', '10.20.7.3', '10.20.7.4'], scope: 'needs_vip', found_by: ['tracer'] },
      api: { origin: 'https://api.payroll.corp.internal', auth: 'bearer', scope: 'published', registry_url: 'https://api-payroll.example.com', note: 'exp_19ad03c4f2' },
      files: { origin: 'http://files.payroll.corp.internal:8080', auth: 'api_key', scope: 'published', registry_url: 'https://files-payroll.example.com', note: 'exp_19ad03c4f2' },
      hrlegacy: { origin: 'https://hr-legacy.corp.internal', auth: 'ntlm', scope: 'published', registry_url: 'https://hr-legacy.example.com', note: 'vs_legacy_portal, added by hand' },
      share: { origin: 'https://files-share.corp.internal', auth: 'ntlm', scope: 'published', registry_url: null, note: 'iRule workaround, added by hand' },
      metrics: { origin: 'https://metrics.corp.internal', auth: 'basic', scope: 'excluded' },
      telemetry: { origin: 'https://telemetry.vendor.example', auth: 'unknown', scope: 'excluded' }
    },
    warnings: {
      reports: ['Found only by the interceptor: the app may assemble this origin at runtime, where the F5 cannot rewrite it.'],
      sso: ["Login redirect: its identity provider must accept a redirect URI on the app's new name."]
    },
    blocked_by: [
      { service: 'search', message: 'http://search.corp.internal:9200 is not in a VIP group.' },
      { service: 'directory', message: 'https://directory.corp.internal uses Kerberos, which cannot be published yet; exclude it on a new scan, or wait for Kerberos support.' },
      { service: 'share', message: "https://files-share.corp.internal is published, but its registry entry has no URL for the app's rewrite map." }
    ],
    events: [
      { at: '11-12 10:41', who: 'jchen', what: 'Submitted scan b3f0c2a9; exposure created, replacing exp_19ad03c4f2' },
      { at: '11-12 10:41', who: 'jchen', what: 'exp_19ad03c4f2 superseded' },
      { at: '11-13 09:02', who: 'mlevi', what: 'Grouping saved: 2 groups (version 2)' },
      { at: '11-13 09:15', who: 'mlevi', what: 'Grouping saved: 2 groups (version 3)' },
      { at: '11-14 16:30', who: 'dcohen', what: 'Grouping saved: 2 groups (version 4)' }
    ]
  },

  plan: {
    id: 'exp_7c41e0a2b9',
    status: 'awaiting_confirmation',
    version: 7,
    hash: 'sha256:5f1c0e9ab47d…e21',
    requested_by: 'dcohen',
    planned_at: '2026-11-15 11:08',
    summary: { add: 7, change: 1, destroy: 0, ips: 2, dns: 3, certificates: 2 },
    vips: [
      {
        name: 'VIP 1',
        ip: '203.0.113.21',
        certificate: { name: '/exp_payroll/vip1_2026-11-15', names: ['reports-corp.example.com', 'sso-corp.example.com'], expires: '2027-11-15' },
        services: [
          { original: 'https://reports.corp.internal', url: 'https://reports-corp.example.com', pool: ['10.20.4.31:443'], warn: 'Found only by the interceptor' },
          { original: 'https://sso.corp.internal', url: 'https://sso-corp.example.com', pool: ['10.20.1.5:443', '10.20.1.6:443'], warn: 'Login redirect' }
        ]
      },
      {
        name: 'VIP 2',
        ip: '203.0.113.22',
        certificate: { name: '/exp_payroll/vip2_2026-11-15', names: ['search-corp.example.com'], expires: '2027-11-15' },
        services: [
          { original: 'http://search.corp.internal:9200', url: 'https://search-corp.example.com', pool: ['10.20.7.2:9200', '10.20.7.3:9200', '10.20.7.4:9200'] }
        ]
      }
    ],
    app_vip: {
      name: 'payroll.example.com',
      ip: '203.0.113.20',
      existing: true,
      rewrite: [
        { original: 'https://reports.corp.internal', url: 'https://reports-corp.example.com', source: 'new' },
        { original: 'https://sso.corp.internal', url: 'https://sso-corp.example.com', source: 'new' },
        { original: 'http://search.corp.internal:9200', url: 'https://search-corp.example.com', source: 'new' },
        { original: 'https://api.payroll.corp.internal', url: 'https://api-payroll.example.com', source: 'published' },
        { original: 'http://files.payroll.corp.internal:8080', url: 'https://files-payroll.example.com', source: 'published' },
        { original: 'https://hr-legacy.corp.internal', url: 'https://hr-legacy.example.com', source: 'published' },
        { original: 'https://files-share.corp.internal', url: 'https://files-share.example.com', source: 'published' }
      ]
    },
    warnings: [
      { service: 'https://reports.corp.internal', text: 'Found only by the interceptor: the app may assemble this origin at runtime, where the F5 cannot rewrite it.' },
      { service: 'https://sso.corp.internal', text: "Login redirect: its identity provider must accept a redirect URI on the app's new name." },
      { service: null, text: 'Bundles loaded with Subresource Integrity fail their hash once rewritten. The scan cannot tell whether this app uses it.' }
    ],
    // The dry-run diff, unified: what the declaration changes on the F5.
    diff: [
      { op: ' ', text: '"exp_payroll": {' },
      { op: ' ', text: '  "class": "Tenant",' },
      { op: ' ', text: '  "payroll_app": {' },
      { op: ' ', text: '    "vs_app": {' },
      { op: ' ', text: '      "class": "Service_HTTPS",' },
      { op: ' ', text: '      "virtualAddresses": ["203.0.113.20"],' },
      { op: ' ', text: '      "rewrite_map": [' },
      { op: ' ', text: '        ["https://api.payroll.corp.internal", "https://api-payroll.example.com"],' },
      { op: ' ', text: '        ["http://files.payroll.corp.internal:8080", "https://files-payroll.example.com"],' },
      { op: '-', text: '        ["https://hr-legacy.corp.internal", "https://hr-legacy.example.com"]' },
      { op: '+', text: '        ["https://hr-legacy.corp.internal", "https://hr-legacy.example.com"],' },
      { op: '+', text: '        ["https://files-share.corp.internal", "https://files-share.example.com"],' },
      { op: '+', text: '        ["https://reports.corp.internal", "https://reports-corp.example.com"],' },
      { op: '+', text: '        ["https://sso.corp.internal", "https://sso-corp.example.com"],' },
      { op: '+', text: '        ["http://search.corp.internal:9200", "https://search-corp.example.com"]' },
      { op: ' ', text: '      ]' },
      { op: ' ', text: '    },' },
      { op: '+', text: '    "vs_vip1": {' },
      { op: '+', text: '      "class": "Service_HTTPS",' },
      { op: '+', text: '      "virtualAddresses": ["203.0.113.21"],' },
      { op: '+', text: '      "serverTLS": "vip1_2026-11-15",' },
      { op: '+', text: '      "policyEndpoint": "route_by_host_vip1"' },
      { op: '+', text: '    },' },
      { op: '+', text: '    "pool_reports": { "class": "Pool", "members": [{ "servicePort": 443, "serverAddresses": ["10.20.4.31"] }] },' },
      { op: '+', text: '    "pool_sso": { "class": "Pool", "members": [{ "servicePort": 443, "serverAddresses": ["10.20.1.5", "10.20.1.6"] }] },' },
      { op: '+', text: '    "vs_vip2": {' },
      { op: '+', text: '      "class": "Service_HTTPS",' },
      { op: '+', text: '      "virtualAddresses": ["203.0.113.22"],' },
      { op: '+', text: '      "serverTLS": "vip2_2026-11-15",' },
      { op: '+', text: '      "policyEndpoint": "route_by_host_vip2"' },
      { op: '+', text: '    },' },
      { op: '+', text: '    "pool_search": { "class": "Pool", "members": [{ "servicePort": 9200, "serverAddresses": ["10.20.7.2", "10.20.7.3", "10.20.7.4"] }] }' },
      { op: ' ', text: '  }' },
      { op: ' ', text: '}' }
    ],
    // The pieces a reader would expand: each object of the declaration.
    declaration: {
      class: 'AS3',
      action: 'deploy',
      declaration: {
        class: 'ADC',
        schemaVersion: '3.50.0',
        exp_payroll: {
          class: 'Tenant',
          payroll_app: {
            class: 'Application',
            vs_app: { class: 'Service_HTTPS', virtualAddresses: ['203.0.113.20'], serverTLS: 'app_2026-10-03', profileRewrite: 'rewrite_payroll' },
            vs_vip1: { class: 'Service_HTTPS', virtualAddresses: ['203.0.113.21'], serverTLS: 'vip1_2026-11-15', policyEndpoint: 'route_by_host_vip1' },
            pool_reports: { class: 'Pool', members: [{ servicePort: 443, serverAddresses: ['10.20.4.31'] }] },
            pool_sso: { class: 'Pool', members: [{ servicePort: 443, serverAddresses: ['10.20.1.5', '10.20.1.6'] }] },
            vs_vip2: { class: 'Service_HTTPS', virtualAddresses: ['203.0.113.22'], serverTLS: 'vip2_2026-11-15', policyEndpoint: 'route_by_host_vip2' },
            pool_search: { class: 'Pool', members: [{ servicePort: 9200, serverAddresses: ['10.20.7.2', '10.20.7.3', '10.20.7.4'] }] }
          }
        }
      }
    }
  }
};
