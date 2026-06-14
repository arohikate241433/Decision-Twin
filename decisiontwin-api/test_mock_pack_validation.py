import os
import tempfile
import unittest

import main


class EnsureMockPacksTests(unittest.TestCase):
    def test_regenerates_missing_mock_pack(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            csv_path = os.path.join(tmp_dir, 'lending_mock.csv')
            model_path = os.path.join(tmp_dir, 'lending_model.pkl')

            with open(csv_path, 'w', encoding='utf-8') as fh:
                fh.write('gender,race,approved\nM,White,1\nF,Black,0\n')

            generated = {'called': False}

            def fake_generator():
                generated['called'] = True
                with open(model_path, 'wb') as fh:
                    fh.write(b'not-a-real-model')

            main.ensure_mock_packs(mock_dir=tmp_dir, generator=fake_generator, domains=['lending'])

            self.assertTrue(generated['called'])
            self.assertTrue(os.path.exists(model_path))


if __name__ == '__main__':
    unittest.main()
