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

func TestReadDiagramCarriesTheRevisionItWasOpenedAt(t *testing.T) {
	document := `{"version":1,"category":"flow","source":"","direction":"down","ink":{"id":"mono"},"style":"formal","scene":{"elements":[],"files":{}}}`
	request := httptest.NewRequest("PUT", "/api/v1/diagrams/x", strings.NewReader(`{"title":"T","category":"flow","document":`+document+`,"revision":7}`))
	input, err := readDiagram(httptest.NewRecorder(), request)
	if err != nil || input.Revision == nil || *input.Revision != 7 {
		t.Fatalf("revision was not read: %v %v", input.Revision, err)
	}
	request = httptest.NewRequest("PUT", "/api/v1/diagrams/x", strings.NewReader(`{"title":"T","category":"flow","document":`+document+`}`))
	input, err = readDiagram(httptest.NewRecorder(), request)
	if err != nil || input.Revision != nil {
		t.Fatal("a save without a revision must still be accepted, as before")
	}
}

func TestShareTokensAndAccess(t *testing.T) {
	if !shareTokenPattern.MatchString("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") ||
		shareTokenPattern.MatchString("short") ||
		shareTokenPattern.MatchString("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/") {
		t.Fatal("share token pattern is wrong")
	}
	if !validShareAccess("view") || !validShareAccess("edit") || validShareAccess("owner") || validShareAccess("") {
		t.Fatal("share access is view or edit only")
	}
	if uuidPattern.MatchString("' or 1=1 --") || !uuidPattern.MatchString("00000000-0000-0000-0000-000000000000") {
		t.Fatal("uuid pattern is wrong")
	}
}
