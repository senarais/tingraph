package api

import "net/http"

func (server *Server) registerApplicationRoutes(mux *http.ServeMux) {
	mux.Handle("GET /api/v1/me", server.requireSession(http.HandlerFunc(server.me)))
	mux.Handle("PATCH /api/v1/me/profile", server.requireSession(http.HandlerFunc(server.updateProfile)))
	mux.Handle("POST /api/v1/me/avatar", server.requireSession(http.HandlerFunc(server.uploadAvatar)))
	mux.Handle("GET /api/v1/diagrams", server.requireSession(http.HandlerFunc(server.listDiagrams)))
	mux.Handle("POST /api/v1/diagrams", server.requireSession(http.HandlerFunc(server.createDiagram)))
	mux.Handle("GET /api/v1/diagrams/{id}", server.requireSession(http.HandlerFunc(server.getDiagram)))
	mux.Handle("PUT /api/v1/diagrams/{id}", server.requireSession(http.HandlerFunc(server.updateDiagram)))
	mux.Handle("DELETE /api/v1/diagrams/{id}", server.requireSession(http.HandlerFunc(server.deleteDiagram)))
	mux.Handle("POST /api/v1/usage/generations", server.requireSession(http.HandlerFunc(server.consumeGeneration)))
	mux.HandleFunc("GET /media/avatars/{user}/{file}", server.avatar)
	mux.Handle("POST /api/v1/ai", server.requireSession(http.HandlerFunc(server.ai)))
}
