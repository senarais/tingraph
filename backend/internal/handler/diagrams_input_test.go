package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadDiagramAcceptsAStudioSheet(t *testing.T) {
	read := func(body string) error {
		request := httptest.NewRequest("POST", "/api/v1/diagrams", strings.NewReader(body))
		_, err := readDiagram(httptest.NewRecorder(), request)
		return err
	}
	document := `{"version":1,"category":"studio","source":"","direction":"down","ink":{"id":"mono"},"style":"formal","scene":{"elements":[],"files":{}}}`
	if err := read(`{"title":"Thesis figures","category":"studio","document":` + document + `}`); err != nil {
		t.Fatalf("a Studio sheet was refused: %v", err)
	}
	if err := read(`{"title":"Thesis figures","category":"flow","document":` + document + `}`); err == nil {
		t.Fatal("a document whose category disagrees with its row was accepted")
	}
	if err := read(`{"title":"Thesis figures","category":"board","document":` + strings.Replace(document, "studio", "board", 1) + `}`); err == nil {
		t.Fatal("an unknown category was accepted")
	}
}
