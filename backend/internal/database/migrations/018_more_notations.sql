-- Seven more notations: four charts, a timeline, a Sankey diagram and the block diagram.
alter table app.diagrams drop constraint diagrams_category_check;
alter table app.diagrams add constraint diagrams_category_check check (category = any (array[
  'flow', 'bpmn', 'org', 'usecase', 'activity', 'sequence', 'erd', 'architecture',
  'class', 'dfd', 'state', 'tree', 'block',
  'bar', 'histogram', 'line', 'pie', 'scatter', 'area', 'waterfall', 'funnel', 'radar',
  'mind', 'matrix', 'venn', 'fishbone', 'prisma', 'quadrant', 'gantt', 'timeline', 'sankey',
  'studio'
]));
