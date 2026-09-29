alter table app.diagrams drop constraint diagrams_category_check;
alter table app.diagrams add constraint diagrams_category_check check (category = any (array[
  'flow', 'bpmn', 'org', 'usecase', 'activity', 'sequence', 'erd', 'architecture',
  'bar', 'line', 'pie', 'scatter', 'mind', 'matrix', 'venn', 'fishbone'
]));
