"""Validate captured mock response examples against the generated OpenAPI file."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).parent
URI = 'urn:ganada:openapi'

def validate():
    spec = json.loads((ROOT / 'openapi.json').read_text(encoding='utf-8'))
    examples = json.loads((ROOT / 'examples.json').read_text(encoding='utf-8'))
    resource = Resource.from_contents({'$schema': 'https://json-schema.org/draft/2020-12/schema', **spec})
    registry = Registry().with_resource(URI, resource)
    for example in examples:
        path = example['path'].split('?')[0]
        candidates = []
        for route, methods in spec['paths'].items():
            a, b = route.split('/'), path.split('/')
            method = example['method'].lower()
            if len(a) == len(b) and all(x == y or x.startswith('{') for x, y in zip(a, b)) and method in methods:
                candidates.append((sum(x == y for x, y in zip(a, b)), route))
        assert candidates, (example['name'], path)
        route = max(candidates)[1]
        response = spec['paths'][route][example['method'].lower()]['responses'][str(example['status'])]
        if 'application/json' in response.get('content', {}):
            # Validate in the OpenAPI document's URI scope so local refs resolve.
            pointer = route.replace('~', '~0').replace('/', '~1')
            schema_ref = f'{URI}#/paths/{pointer}/{example["method"].lower()}/responses/{example["status"]}/content/application~1json/schema'
            Draft202012Validator({'$ref': schema_ref}, registry=registry).validate(example['response'])
        else:
            assert example['response'] is None, example['name']
    message = f'{len(examples)} captured responses validated against OpenAPI {spec["info"]["version"]}.'
    (ROOT / 'examples-validation.log').write_text(message + '\n', encoding='utf-8')
    print(message)

if __name__ == '__main__':
    validate()
