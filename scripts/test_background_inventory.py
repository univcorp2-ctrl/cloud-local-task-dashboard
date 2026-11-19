import datetime as dt
import unittest
from background_inventory import plan
class InventoryTests(unittest.TestCase):
 def test_missing_triggers_and_running_codes(self):
  r=plan({'jobs':[],'usage':[]},[{'name':'A','path':'\\','state':'Running','result':267009,'triggers':[None]}],[],dt.datetime.now(dt.timezone.utc))
  self.assertEqual(r['creates'][0]['properties']['状態'],'稼働')
  self.assertIn('頻度未取得',r['creates'][0]['properties']['スケジュール'])
 def test_existing_id_is_updated_and_stale_source_not_healthy(self):
  state={'jobs':[{'source':'claude-cloud','items':[{'id':'id','name':'A','lastRunAt':'2020-01-01T00:00:00Z','enabled':True}]}]}
  r=plan(state,[],[{'url':'https://notion.so/abc','ID・場所':'id'}],dt.datetime.now(dt.timezone.utc))
  self.assertEqual(len(r['creates']),0);self.assertEqual(r['updates'][0]['properties']['状態'],'要確認')
if __name__=='__main__':unittest.main()
