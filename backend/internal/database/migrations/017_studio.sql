-- Studio sheets hold drawings in several notations and are saved as 'studio'.
alter table app.diagrams drop constraint diagrams_category_check;
alter table app.diagrams add constraint diagrams_category_check check (category = any (array[
  'flow', 'bpmn', 'org', 'usecase', 'activity', 'sequence', 'erd', 'architecture',
  'class', 'dfd', 'state', 'tree',
  'bar', 'histogram', 'line', 'pie', 'scatter', 'mind', 'matrix', 'venn', 'fishbone', 'prisma', 'quadrant', 'gantt',
  'studio'
]));
