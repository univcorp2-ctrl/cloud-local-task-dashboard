import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from collect_background_usage import codex_events,claude_events
from background_usage import summarize,stamp
class LocalUsageTests(unittest.TestCase):
 def test_codex_cumulative_baseline_and_duplicate_files(self):
  start=stamp('2026-11-16');end=start+dt.timedelta(days=7)
  events=[{'type':'session_meta','payload':{'id':'one','originator':'codex_exec'}}]
  for at,total in [('2026-11-15T00:00:00Z',100),('2026-11-17T00:00:00Z',160),('2026-11-17T00:01:00Z',200)]:
   events.append({'type':'event_msg','timestamp':at,'payload':{'type':'token_count','info':{'total_token_usage':{'total_tokens':total}}}})
  with tempfile.TemporaryDirectory() as folder:
   home=Path(folder);p=home/'.codex/sessions';p.mkdir(parents=True)
   for name in ('one.jsonl','copy.jsonl'):(p/name).write_text('\n'.join(json.dumps(e) for e in events),encoding='utf-8')
   rows=summarize(codex_events(home,start,end),start.isoformat(),{})
   self.assertEqual(rows[0]['tokens'],100)
 def test_claude_streaming_max_and_missing_sources(self):
  start=stamp('2026-11-16');end=start+dt.timedelta(days=7)
  with tempfile.TemporaryDirectory() as folder:
   home=Path(folder);self.assertEqual(claude_events(home,start,end),[])
   p=home/'.claude/projects/project';p.mkdir(parents=True)
   events=[{'type':'assistant','sessionId':'one','timestamp':'2026-11-17T00:00:00Z','message':{'id':'message','usage':{'input_tokens':10,'output_tokens':n,'cache_read_input_tokens':5}}} for n in (2,7)]
   (p/'one.jsonl').write_text('\n'.join(json.dumps(e) for e in events),encoding='utf-8')
   self.assertEqual(claude_events(home,start,end)[0]['tokens'],22)
if __name__=='__main__':unittest.main()
