INSERT INTO "Category" ("name") VALUES ('Routing') ON CONFLICT DO NOTHING;
INSERT INTO "Note" ("slug", "title", "body", "categoryName") VALUES
('first-route', 'My first route', 'A route connects a URL to the content it displays.', 'Routing'),
('server-html', 'Reading server HTML', 'A direct request can contain useful content before JavaScript runs.', 'Routing')
ON CONFLICT DO NOTHING;
