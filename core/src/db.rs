//! SQLite-backed implementation of [`GalleyApi`].
//!
//! M2 ships a struct + stub impl returning `todo!()` from every method.
//! M3 fills in real SQLite reads against the existing schema (see
//! `migrations/001_init.sql` onward).

use async_trait::async_trait;

use crate::api::{
    GalleyApi, HealthReport, MessageBrief, SearchHit, SearchScope, SessionBrief, SessionFilter,
    SessionId, StatusSummary,
};
use crate::error::Result;

/// SQLite-backed Galley Core impl. Currently empty; M3 will add the
/// connection pool and per-method SQL.
pub struct SqliteGalley;

#[async_trait]
impl GalleyApi for SqliteGalley {
    async fn list_sessions(&self, _filter: SessionFilter) -> Result<Vec<SessionBrief>> {
        todo!("M3")
    }

    async fn session_brief(&self, _id: SessionId) -> Result<SessionBrief> {
        todo!("M3")
    }

    async fn session_messages(
        &self,
        _id: SessionId,
        _tail: Option<usize>,
    ) -> Result<Vec<MessageBrief>> {
        todo!("M3")
    }

    async fn search_messages(
        &self,
        _query: String,
        _scope: SearchScope,
    ) -> Result<Vec<SearchHit>> {
        todo!("M3")
    }

    async fn status(&self) -> Result<StatusSummary> {
        todo!("M3")
    }

    async fn health(&self) -> Result<HealthReport> {
        todo!("M3")
    }
}
